import tl = require('azure-pipelines-task-lib/task');
import tr = require('azure-pipelines-task-lib/toolrunner');
import { parameters } from './interfaces'
import yaml = require('yaml');
import fs = require('fs');

const execOpts: tr.IExecSyncOptions = { silent: true };

async function run() {
    try {
        let parameters: parameters;
        try {
            parameters = {
                filename: tl.getInput('filename', true) || '',
                key: tl.getInput('key', true) || '',
                value: tl.getInput('value', false),
                createBackup: tl.getBoolInput('createBackup', false) || false
            }
        } catch (err) {
            if (err instanceof Error) {
                tl.setResult(tl.TaskResult.Failed, err.message);
                return;
            } else {
                tl.setResult(tl.TaskResult.Failed, "Unknown error");
                return;
            }
        }
        updateYamlFile(parameters);
    }
    catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Unknown error");
        }
    }
}

// get latest tag in git repository
async function getLatestTag(): Promise<string | undefined> {
    try {
        if (tl.execSync('git', ['tag'], execOpts).stdout.trim() == "") {
            tl.debug("No tags found");
        } else {
            return (tl.execSync('git', ['describe', '--abbrev=0', '--tags'], execOpts)).stdout.trim();
        }
    }
    catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Unknown error");
        }
    }
}

// update yaml file with new key value pair
async function updateYamlFile(parameters: parameters): Promise<void> {
    try {
        let yamlData = yaml.parse(fs.readFileSync(parameters.filename, 'utf8'));
        if (parameters.value == undefined) {
            const latestTag = await getLatestTag();
            if (latestTag != undefined) {
                tl.debug(`No value provided for key: ${parameters.key}, using latest tag: ${latestTag}`);
                yamlData[parameters.key] = latestTag;
            } else {
                tl.debug(`No value provided for key: ${parameters.key}, and no tags found`);
                tl.setResult(tl.TaskResult.Failed, `No value provided for key: ${parameters.key}, and no tags found`)
            }
        } else {
            tl.debug(`Updating key: ${parameters.key} with value: ${parameters.value}`);
            yamlData[parameters.key] = parameters.value;
        }
        const output = new yaml.Document(yamlData);
        console.log(output.toString())
        if (parameters.createBackup) {
            fs.copyFileSync(parameters.filename, `${parameters.filename}.bak`);
        }
        fs.writeFileSync(parameters.filename, String(output));
    } catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Unknown error");
        }
    }
}

run();
