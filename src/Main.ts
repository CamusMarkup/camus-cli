#!/usr/bin/env node
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
        process.stdout.write('0.1.0');
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
        let configFileData = fs.readFileSync(process.argv[3], {encoding: 'utf-8'});
        let config: CamusCLIConfig = JSON.parse(configFileData);
        let renderer = new CLIRenderer(config);
        renderer.processFile(path.join(config.basePath||'', config.main));
        if (config.rss.enabled) {
            renderer.rss();
        }
        break;
    }
}
