
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import * as camus from '@bctnry/camus-core';


export type CamusCLIConfig = {
    basePath?: string,
    main: string,
    preamble: {
        enabled: boolean,
        path: string,
    },
    postamble: {
        enabled: boolean,
        path: string,
    },
    rss: {
        enabled: boolean,
        targetFilePath: string,
        title: string,
        description: string,
        copyright: string,
        channelUrl: string,
        feedUrl: string,
        itemBaseUrl: string,
        ignore?: string[],
    },
    sourceHighlight: {
        enabled: boolean,
        command: string[],
        langAlias?: {
            [key: string]: string
        }
    }
}

function alignTimeNumber(x: number) {
    return `${x>10?'':'0'}${x}`;
}

function formatDate(x: Date) {
    let offsetH = Math.floor((-x.getTimezoneOffset())/60);
    let offsetM = (-x.getTimezoneOffset()) - offsetH*60;
    let sign = (-x.getTimezoneOffset()) >= 0;
    offsetH = Math.abs(offsetH);
    offsetM = Math.abs(offsetM);
    let dayString = [
        'Sun',
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat'
    ][x.getDay()];
    let monthString = [
        '', 'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ][x.getMonth()];
    
    return `${dayString}, ${alignTimeNumber(x.getDate())} ${monthString} ${x.getFullYear()} ${alignTimeNumber(x.getHours())}:${alignTimeNumber(x.getMinutes())}:${alignTimeNumber(x.getSeconds())} ${sign?'+':'-'}${alignTimeNumber(offsetH)}${alignTimeNumber(offsetM)}`;
}

export class CLIRenderer extends camus.Renderer.HTMLRenderer {
    private _queueStk: string[] = [];
    private _doneStk: string[] = [];
    private _rssStk: {title: string, url: string, date: Date}[] = [];
    private _currentPath: string = '';
    private _currentTitle: string = '';
    private _preamble: string = '';
    private _postamble: string = '';
    private _basePath: string = '';
    constructor(
        private readonly cliOption: CamusCLIConfig,
        options?: camus.Renderer.HTMLRendererOption
    ) {
        super(options);

        this._basePath = path.resolve(cliOption.basePath || process.cwd());
        if (cliOption.preamble.enabled) {
            this._preamble = fs.readFileSync(path.join(this._basePath, cliOption.preamble.path), {encoding:'utf-8'});
        }
        if (cliOption.postamble.enabled) {
            this._postamble = fs.readFileSync(path.join(this._basePath, cliOption.postamble.path), {encoding:'utf-8'});
        }
    }

    processFile(x: string) {
        let realX = path.resolve(x);
        if (!fs.existsSync(realX)) {
            console.error(`path ${realX} does not exists. skipping.`);
            return;
        }
        if (this._doneStk.includes(realX)) { return; }
        this._currentPath = path.dirname(realX);
        let resultPath = (
            realX.endsWith('.cm')? realX.substring(0, realX.length-3)
            : realX.endsWith('.cm3')? realX.substring(0, realX.length-4)
            : realX
        )+'.html';
        let fileData = fs.readFileSync(realX, {encoding:'utf-8'});
        this._currentTitle = '';
        // NOTE: this.render will change this._currentTitle and this._queueStk
        // thru methods `_heading` and `_ref`.
        let renderData = this.render(camus.Parser.parse(fileData));
        fs.writeFileSync(resultPath, this._preamble.replace('%title%', this._currentTitle));
        fs.appendFileSync(resultPath, renderData);
        fs.appendFileSync(resultPath, this._postamble.replace('%title%', this._currentTitle));
        let xStat = fs.statSync(realX);
        let normalizedItemBaseUrl = this.cliOption.rss.itemBaseUrl.endsWith('/')? this.cliOption.rss.itemBaseUrl : this.cliOption.rss.itemBaseUrl + '/';
        let rel = path.relative(path.resolve(this._basePath), x);
        if (!this.cliOption.rss.ignore || !this.cliOption.rss.ignore.includes(rel)) {
            this._rssStk.push({
                title: this._currentTitle||'',
                url: `${normalizedItemBaseUrl}${path.relative(this._basePath, resultPath)}`,
                date: xStat.atime
            });
        }
        this._doneStk.push(realX);
        while (this._queueStk.length > 0) {
            this.processFile(this._queueStk.shift()!);
        }
    }

    rss() {
        if (!this.cliOption.rss.enabled) { return; }
        let rssFeedFilePath = path.resolve(this.cliOption.rss.targetFilePath);
        fs.writeFileSync(rssFeedFilePath, `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
    <title>${this.cliOption.rss.title}</title>
    <atom:link href="${this.cliOption.rss.feedUrl}" rel="self" type="application/rss+xml" />
    <link>${this.cliOption.rss.channelUrl}</link>
    <description>${this.cliOption.rss.description}</description>
    <copyright>${this.cliOption.rss.copyright}</copyright>
    <lastBuildDate>${formatDate(new Date())} </lastBuildDate>
    <pubDate>${formatDate(new Date())}</pubDate>
`);
        this._rssStk.sort((a, b) => a.date > b.date? -1 : a.date === b.date? 0 : 1);
        for (let i = 0; i < this._rssStk.length; i++) {
            let v = this._rssStk[i];
            fs.appendFileSync(rssFeedFilePath, `
<item>
    <title>${v.title}</title>
    <guid>${v.url}</guid>
    <link>${v.url}</link>
    <description></description>
    <pubDate>${formatDate(v.date)}</pubDate>
</item>
`);
            
        }
        fs.appendFileSync(rssFeedFilePath, `\n</channel>\n</rss>`);
    }

    private _flatten(n: camus.AST.CamusLine) {
        // TODO: fix this with proper flatten procedure later.
        return n.filter((v) => typeof v === 'string').join('');
    }

    protected _block(n: camus.AST.BlockNode) {
        if (n.type === 'code' && this.cliOption.sourceHighlight.enabled) {
            this._pp.indent().string(`<pre class="code code-${n.arg}">`).line().addIndent();
            
            let langAlias = this.cliOption.sourceHighlight.langAlias;
            let lang = langAlias && langAlias[n.arg.trim()]? langAlias[n.arg.trim()] : n.arg.trim();
            let command = this.cliOption.sourceHighlight.command;
            let cp = child_process.spawnSync(
                command[0],
                command.slice(1).map((v) => v.replace('%lang%', lang)),
                {
                    input: n.text.join('\n')
                }
            );
            if (!cp.stdout.toString('utf-8')) {
                n.text.forEach((v) => {
                    v.forEach((j) => { this._text(j as string); this._pp.line(); });
                });
            } else {
                this._pp.string(cp.stdout.toString('utf-8'));
            }
            this._pp.removeIndent().indent().string(`</pre>`).line();

        } else {
            super._block(n);
        }
    }

    protected _heading(n: camus.AST.HeadingNode) {
        if (n.level === 1) {
            this._currentTitle = this._flatten(n.text);
        }
        super._heading(n);
    }

    protected _ref(x: camus.AST.RefNode) {
        if (x.path.startsWith('#')) { super._ref(x); return; }
        let currentDir = this._currentPath;
        let realRefPath = path.join(currentDir, x.path);
        if (!this._doneStk.includes(realRefPath)) {
            this._queueStk.push(realRefPath);
        }
        let realRefResultPath = (
            realRefPath.endsWith('.cm')? realRefPath.substring(0, realRefPath.length-3)
            : realRefPath.endsWith('.cm3')? realRefPath.substring(0, realRefPath.length-4)
            : realRefPath
        )+'.html';
        let hrefPath = path.relative(this._currentPath, realRefResultPath);
        this._pp.string(`<a href="${hrefPath}">`);
        this._renderLine(x.text);
        this._pp.string(`</a>`);
    }
}


