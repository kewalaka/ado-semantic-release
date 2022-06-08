import tl = require('azure-pipelines-task-lib/task');
import { commitDetails, conventionalCommitDetails, releaseNoteItem, kv } from './interfaces'
import { commitTypeList, commitType } from './constants';
import fs = require('fs');
import path = require('path');
import handlebars = require('handlebars');

async function run() {
    try {
        let parameters: kv = {}
        try {
            parameters = {
                releaseNotesFrom: tl.getInput('releaseNotesFrom') || await getNotesFrom(),
                releaseNotesTo: tl.getInput('releaseNotesTo') || 'HEAD',
                releaseNotesPath: tl.getInput('releaseNotesPath') || 'RELEASE_NOTES.md',
                releaseNotesTemplatePath: tl.getInput('releaseNotesTemplatePath') || path.join(__dirname, 'template.md.hbs'),
                releaseNotesVersion: tl.getInput('releaseNotesVersion') || '',
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
        const commits: Array<string> = await getCommitsBetweenTags(parameters.releaseNotesFrom, parameters.releaseNotesTo);
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
            version: parameters.releaseNotesVersion,
            features: await getReleaseNoteBlock(allCommitDetails, commitType.features),
            chore: await getReleaseNoteBlock(allCommitDetails, commitType.chore),
            ci: await getReleaseNoteBlock(allCommitDetails, commitType.ci),
            fixes: await getReleaseNoteBlock(allCommitDetails, commitType.fixes),
            other: await getReleaseNoteBlock(allCommitDetails, commitType.other),
            breaking: await getReleaseNoteBlock(allCommitDetails, undefined, true),
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
async function getFirstCommit(): Promise<string | null> {
    try {
        const output = tl.execSync('git', ['rev-list', '--max-parents=0', 'HEAD']);
        console.log(output);
        return output.stdout.trim();
    }
    catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Unknown error");
        }
        return null;
    }
}

// get latest tag in git repository
async function getLatestTag(): Promise<string | null> {
    try {
        if (tl.execSync('git', ['tag']).stdout.trim() == "") {
            tl.debug("No tags found");
            return null;
        } else {
            return (tl.execSync('git', ['describe', '--abbrev=0', '--tags'])).stdout.trim();
        }
    }
    catch (err) {
        if (err instanceof Error) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        } else {
            tl.setResult(tl.TaskResult.Failed, "Unknown error");
        }
        return null;
    }
}

// get list of commits between two tags
async function getCommitsBetweenTags(start: string, end: string): Promise<Array<string>> {
    try {
        const output = tl.execSync('git', ['rev-list', start + '..' + end]);
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
            '"subject": "%s", "sanitized_subject_line": "%f", "commit_notes": "%N", ' +
            '"verification_flag": "%G?", "signer": "%GS", "signer_key": "%GK", ' +
            '"author": { "name": "%aN", "email": "%aE", "date": "%aD" }, ' +
            '"commiter": { "name": "%cN", "email": "%cE", "date": "%cD" }}';
        const formatBody = '%b';
        const commitDetailsRaw = tl.execSync('git', ['show', '--quiet', '--pretty=format:' + format, commit]);
        const commitBodyRaw = tl.execSync('git', ['show', '--quiet', '--pretty=format:' + formatBody, commit]);
        const commitDetailsJson = JSON.parse(commitDetailsRaw.stdout);
        // replace newlines in commit body with \n
        const commitBody = commitBodyRaw.stdout.replace(/\n/g, '\\n');
        // add commit body to commit details
        commitDetailsJson.body = commitBody;
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
        text = text.replace(/(\\n)/gm, '\n        ');
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
    if (latestTag === null) {
        if (firstCommit != null) {
            return firstCommit;
        } else {
            tl.setResult(tl.TaskResult.Failed, "Cannot find first commit or latest tag");
            return "";
        }
    } else {
        return latestTag;
    }
}

async function calculateVersion(version: string, changes: string): Promise<string> {
    // if version starts with v, remove it
    if (version.startsWith("v")) {
        version = version.substring(1, version.length);
    }
    // switch over changes, if major bump major, minor bump minor, patch bump patch
    const semver = require('semver');
    const semverVersion = semver.parse(version);
    switch (changes) {
        case "major":
            return semverVersion.major + 1 + ".0.0";
        case "minor":
            return semverVersion.major + "." + semverVersion.minor + 1 + ".0";
        case "patch":
            return semverVersion.major + "." + semverVersion.minor + "." + semverVersion.patch + 1;
        default:
            tl.setResult(tl.TaskResult.Failed, "Unknown change type");
            return "";
    }
}

run();
