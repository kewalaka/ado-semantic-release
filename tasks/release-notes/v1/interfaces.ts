export interface parameters {
    releaseNotesFrom: string;
    releaseNotesTo: string;
    releaseNotesPath: string;
    releaseNotesTemplatePath: string;
    releaseNotesVersion: string;
    setVersionToGitTag: boolean;
}

interface authorDetails {
    name: string;
    email: string;
    date: string;
}

export interface conventionalCommitDetails {
    type: string;
    scope: string;
    subject: string;
    breaking: boolean;
}

export interface commitDetails {
    tree: string;
    abbreviated_tree: string;
    parent: string;
    abbreviated_parent: string;
    refs: string;
    encoding: string;
    subject: string;
    sanitized_subject_line: string;
    commit_notes: string;
    verification_flag: string;
    signer: string;
    signer_key: string;
    body: string;
    commiter: authorDetails;
    author: authorDetails;
    conventionalCommitDetails: conventionalCommitDetails;
}

export interface releaseNoteItem {
    scope: string;
    subject: string;
    body: string;
}
