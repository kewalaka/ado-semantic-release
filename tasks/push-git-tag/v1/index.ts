import tl = require('azure-pipelines-task-lib/task');
import tr = require('azure-pipelines-task-lib/toolrunner');
import { parameters } from './interfaces'

const execOpts: tr.IExecSyncOptions = { silent: true };

async function run() {
    try {
        let parameters: parameters;
        try {
            parameters = {
                publishLatestTagOnly: tl.getBoolInput('publishLatestTagOnly', false) || true,
                remoteName: tl.getInput('remoteName', false) || 'origin',
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
        pushGitTag(parameters.publishLatestTagOnly, parameters.remoteName);
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

// push git tag to git repository
async function pushGitTag(publishLatestTagOnly: boolean = true, remoteName: string = 'origin'): Promise<void> {
    try {
        if (publishLatestTagOnly) {
            const tag = await getLatestTag();
            if (tag != undefined) {
                tl.execSync('git', ['push', remoteName, tag], execOpts);
            } else {
                tl.setResult(tl.TaskResult.Failed, "No tags found");
            }
        } else {
            tl.execSync('git', ['push', remoteName, '--tags'], execOpts);
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

run();
