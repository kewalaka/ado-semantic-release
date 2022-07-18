import tl = require('azure-pipelines-task-lib/task');
import tr = require('azure-pipelines-task-lib/toolrunner');
import { commitDetails, conventionalCommitDetails, releaseNoteItem, parameters } from './interfaces'
import { commitTypeList, commitType } from './constants';
import fs = require('fs');
import path = require('path');
import handlebars = require('handlebars');
import semver = require('semver');

let execOpts: tr.IExecSyncOptions;

async function run() {
    try {
        let parameters: parameters;
        try {
            parameters = {
                releaseNotesFrom: tl.getInput('releaseNotesFrom') || await getNotesFrom(),
                releaseNotesTo: tl.getInput('releaseNotesTo') || 'HEAD',
                releaseNotesPath: tl.getInput('releaseNotesPath') || 'RELEASE_NOTES.md',
                releaseNotesTemplatePath: tl.getInput('releaseNotesTemplatePath') || path.join(__dirname, 'template.md.hbs'),
                releaseNotesVersion: semver.valid(tl.getInput('releaseNotesTo')) || semver.valid(await getLatestTag()) || '0.0.0',
                setVersionToGitTag: tl.getBoolInput('setVersionToGitTag') || false,
                gitTagPrefix: tl.getInput('gitTagPrefix') || '',
                gitTagSuffix: await addDash(tl.getInput('gitTagSuffix')) || '',
            };
            execOpts = {
                silent: tl.getBoolInput('hideSubprocessOutput') || true,
                cwd: tl.getInput('workingDirectory')
            };
        } catch (err) {
            if (err instanceof Error) {
                tl.setResult(tl.TaskResult.Failed, err.message);
                return;
            } else {
                tl.setResult(tl.TaskResult.Failed, "Unknown error");
                return;
            }
        }
        const commits: Array<string> = await getCommitsBetweenTags(parameters.releaseNotesFrom, parameters.releaseNotesTo);
        if (commits.length == 0) {
            tl.setResult(tl.TaskResult.Failed, "No commits found. Please check releaseNotesFrom and releaseNotesTo parameters.");
            return;
        }
        // iterate over commits to get commit details
        let allCommitDetails: Array<commitDetails> = [];
        for (const commit of commits) {
            allCommitDetails.push(await getCommitDetails(commit));
        }
        // iterate over allCommitDetails subject and determine commit type
        for (const commit of allCommitDetails) {
            commit.conventionalCommitDetails = getCommitType(commit.subject);
        }
        // collect all features details
        const releaseNote = {
            version: `${parameters.gitTagPrefix}${parameters.releaseNotesVersion}${parameters.gitTagSuffix}`,
            features: await getReleaseNoteBlock(allCommitDetails, commitType.features),
            chore: await getReleaseNoteBlock(allCommitDetails, commitType.chore),
            ci: await getReleaseNoteBlock(allCommitDetails, commitType.ci),
            fixes: await getReleaseNoteBlock(allCommitDetails, commitType.fixes),
            other: await getReleaseNoteBlock(allCommitDetails, commitType.other),
            breaking: await getReleaseNoteBlock(allCommitDetails, undefined, true),
        }
        // if releaseNote.breaking is not empty use calculateVersion with major changes
        if (releaseNote.breaking != null && releaseNote.breaking.length > 0) {
            releaseNote.version = await calculateVersion(releaseNote.version, 'major');
        } else if (releaseNote.features != null && releaseNote.features.length > 0) {
            releaseNote.version = await calculateVersion(releaseNote.version, 'minor');
        } else {
            releaseNote.version = await calculateVersion(releaseNote.version, 'patch');
        }
        if (parameters.setVersionToGitTag) {
            tl.debug(`Setting version ${parameters.gitTagPrefix}${releaseNote.version}${parameters.gitTagSuffix} to git tag`);
            await setVersionToGitTag(`${parameters.gitTagPrefix}${releaseNote.version}${parameters.gitTagSuffix}`);
        }
        await writeReleaseNote(await renderTemplate(releaseNote, parameters.releaseNotesTemplatePath), parameters.releaseNotesPath);
        tl.TaskResult.Succeeded;
    }
    catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Unknown error");
        }
    }
}

// get first commit in git repository
async function getFirstCommit(): Promise<string | undefined> {
    try {
        const output = tl.execSync('git', ['rev-list', '--max-parents=0', 'HEAD'], execOpts);
        return output.stdout.trim();
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

// get list of commits between two tags
async function getCommitsBetweenTags(start: string, end: string): Promise<Array<string>> {
    try {
        const output = tl.execSync('git', ['rev-list', start + '..' + end], execOpts);
        // split output into array
        const lines = output.stdout.split('\n').filter(line => line.length > 0);
        return lines;
    }
    catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Unknown error");
        }
        return [];
    }
}

// get commit details
async function getCommitDetails(commit: string): Promise<commitDetails> {
    try {
        const format = '{"tree": "%T", "abbreviated_tree": "%t", "parent": "%P", ' +
            '"abbreviated_parent": "%p", "refs": "%D", "encoding": "%e", ' +
            '"sanitized_subject_line": "%f", "commit_notes": "%N", ' +
            '"verification_flag": "%G?", "signer": "%GS", "signer_key": "%GK", ' +
            '"author": { "name": "%aN", "email": "%aE", "date": "%aD" }, ' +
            '"commiter": { "name": "%cN", "email": "%cE", "date": "%cD" }}';
        const formatBody = '%b';
        const formatSubject = '%s';
        const commitDetailsRaw = tl.execSync('git', ['show', '--quiet', '--pretty=format:' + format, commit], execOpts);
        const commitBodyRaw = tl.execSync('git', ['show', '--quiet', '--pretty=format:' + formatBody, commit], execOpts);
        const commitSubject = tl.execSync('git', ['show', '--quiet', '--pretty=format:' + formatSubject, commit], execOpts);
        const commitDetailsJson = JSON.parse(commitDetailsRaw.stdout);
        // replace newlines in commit body with \n
        const commitBody = commitBodyRaw.stdout.replace(/\n/g, '\\n');
        // add commit body to commit details
        commitDetailsJson.body = commitBody;
        // remove quotes from commitSubject.stdout
        commitDetailsJson.subject = commitSubject.stdout.replace(/\"/g, '');
        return commitDetailsJson;
    }
    catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Unknown error");
        }
        return JSON.parse("");
    }
}


// determine commit type based on conventional commit subject
function getCommitType(subject: string): conventionalCommitDetails {
    // regex to match commit type
    const commitTypeRegex = /(?<type>\w+)(?<scope>(?:\([^()\r\n]*\)|\()?(?<breaking>!)?)(?<subject>:.*)?/igm;
    // parse subject
    const commitTypeMatch = commitTypeRegex.exec(subject);
    // log type and scope group if found
    if (commitTypeMatch != null && commitTypeMatch.groups != null) {
        let detailsScope = commitTypeMatch.groups.scope;
        let detailsSubject = commitTypeMatch.groups.subject;
        let detailsBreaking = Boolean(commitTypeMatch.groups.breaking);
        if (!detailsBreaking && subject.includes("BREAKING CHANGE")) {
            detailsBreaking = true;
        }
        let detailsType = commitTypeMatch.groups.type;
        if (!commitTypeList.includes(detailsType) || detailsSubject === undefined) {
            detailsType = "other";
            detailsScope = "";
            detailsSubject = subject;
        }
        // if detailsScope starts with ( and ends with ), remove it
        if (detailsScope != null && detailsScope.startsWith("(") && detailsScope.endsWith(")")) {
            detailsScope = detailsScope.substring(1, detailsScope.length - 1);
        }
        // if detailsSubject starts with :, remove it
        if (detailsSubject != null && detailsSubject.startsWith(":")) {
            detailsSubject = (detailsSubject.substring(1, detailsSubject.length)).trim();
        }
        return {
            type: detailsType,
            scope: detailsScope,
            subject: detailsSubject,
            breaking: detailsBreaking
        };
    }
    return {
        type: "other",
        scope: "",
        subject: subject,
        breaking: false
    }
}

async function getReleaseNoteBlock(allCommitDetails: Array<commitDetails>, blockType?: Array<string>, isBreaking?: boolean): Promise<Array<releaseNoteItem> | null> {
    let releaseNoteBlock: Array<releaseNoteItem> = [];
    if (blockType != null) {
        for (const commit of allCommitDetails) {
            if (blockType.includes(commit.conventionalCommitDetails.type)) {
                releaseNoteBlock.push(
                    {
                        scope: commit.conventionalCommitDetails.scope,
                        subject: commit.conventionalCommitDetails.subject,
                        body: commit.body,
                    });
            }
        }
    } else {
        if (isBreaking) {
            for (const commit of allCommitDetails) {
                if (commit.conventionalCommitDetails.breaking) {
                    releaseNoteBlock.push(
                        {
                            scope: commit.conventionalCommitDetails.scope,
                            subject: commit.conventionalCommitDetails.subject,
                            body: commit.body,
                        });
                }
            }
        }
    }
    if (releaseNoteBlock != null && releaseNoteBlock.length > 0) {
        return releaseNoteBlock;
    }
    return null;
}

// render handlebars template based on releaseNote object
async function renderTemplate(releaseNote: any, releaseNotesTemplatePath: string): Promise<string> {
    const template = fs.readFileSync(releaseNotesTemplatePath, 'utf8');
    handlebars.registerHelper('newline', function (text) {
        text = handlebars.Utils.escapeExpression(text);
        text = text.replace(/(\\n)/gm, '\n');
        return new handlebars.SafeString(text);
    });
    const templateRender = handlebars.compile(template);
    return templateRender(releaseNote);
}

// write release note to file
async function writeReleaseNote(releaseNote: string, filePath: string): Promise<void> {
    try {
        fs.writeFileSync(filePath, releaseNote);
    }
    catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Unknown error");
        }
    }
}

async function getNotesFrom(): Promise<string> {
    const firstCommit = await getFirstCommit();
    const latestTag = await getLatestTag();
    if (latestTag === undefined) {
        if (firstCommit != undefined) {
            return firstCommit;
        } else {
            tl.setResult(tl.TaskResult.Failed, "Cannot find first commit or latest tag");
            return "";
        }
    } else {
        return latestTag;
    }
}

async function calculateVersion(version: string, changes: "major" | "minor" | "patch"): Promise<string> {
    tl.debug(`Original version: ${version}`);
    const calculatedVersion = semver.inc(version, changes);
    tl.debug(`Calculated version: ${calculatedVersion}`);
    if (calculatedVersion != null) {
        return calculatedVersion;
    }
    tl.warning("Invalid version, using default version");
    return "1.0.0";
}

async function setVersionToGitTag(version: string): Promise<void> {
    try {
        tl.execSync('git', ['tag', version], execOpts);
    }
    catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Unknown error");
        }
    }
}

// if parameter is not undefined and starts not from "-", add "-" to the beginning and return
async function addDash(parameter: string | undefined): Promise<string | undefined> {
    if (parameter != undefined && !parameter.startsWith("-")) {
        tl.debug(`Adding dash to parameter: ${parameter}`);
        return `-${parameter}`;
    }
    tl.debug(`Parameter is undefined or starts with dash: ${parameter}`);
    return parameter;
}

run();
