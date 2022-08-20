#!/usr/bin/env node
import { parse } from '@bctnry/camus-core/out/Parser';
import { HTMLRenderer } from '@bctnry/camus-core/out/Renderer';
import * as fs from 'fs';
import * as path from 'path';
import { CamusCLIConfig, CLIRenderer } from './CLIRenderer';


let command = process.argv[2];
if (!command) {
    process.stdout.write(`Usage: camus-cli [init|run|ver] [camus-cli.json]`);
    process.exit(1);
}

switch (command) {
    case 'ver': {
        process.stdout.write('0.2.1');
        break;
    }
    case 'init': {
        let configPath = path.join(process.cwd(), 'camus-cli.json');
        fs.writeFileSync(configPath, JSON.stringify({
            basePath: '.',
            main: "[input main file here]",
            preamble: {
                enabled: false,
                path: "[input postamble path here]",
            },
            postamble: {
                enabled: false,
                path: "[input postamble path here]",
            },
            rss: {
                enabled: false,
                targetFilePath: "feed.rss",
                title: "[input title here]",
                description: "[input description here]",
                copyright: "[input copyright info here]",
                channelUrl: "[input channel url here]",
                itemBaseUrl: "[input item base url here]",
            },
            sourceHighlight: {
                enabled: false,
                command: ['source-highlight', '-s', '%lang%'],
            }
        }, undefined, '    '));
        break;
    }
    case 'run': {
        let oldCwd = process.cwd();
        let configFileData = fs.readFileSync(process.argv[3], {encoding: 'utf-8'});
        let newCwd = path.dirname(path.resolve(process.argv[3]));
        process.chdir(newCwd);
        let config: CamusCLIConfig = JSON.parse(configFileData);
        let renderer = new CLIRenderer(config);
        renderer.processFile(path.join(config.basePath||'', config.main));
        if (config.rss.enabled) {
            renderer.rss();
        }
        process.chdir(oldCwd);
        break;
    }
    case 'singleParse': {
        let renderer = new HTMLRenderer();
        console.log(JSON.stringify(parse(fs.readFileSync(process.argv[3], {encoding: 'utf-8'})), undefined, '    '));
        break;
    }

    case 'singleRender': {
        let renderer = new HTMLRenderer();
        console.log(renderer.render(parse(fs.readFileSync(process.argv[3], {encoding: 'utf-8'}))));
        break;
    }
}
