interface commitTypeItem {
    [key: string]: Array<string>;
}

export const commitType: commitTypeItem = {
    chore: ['chore', 'docs', 'lint', 'perf', 'ref', 'refactor', 'style'],
    ci: ['ci', 'build'],
    features: ['feature', 'feat'],
    fixes: ['fix'],
    other: ['merge', 'wip', 'test', 'update', 'other']
}

// get all values from commitType
export const commitTypeList: Array<string> = Object.values(commitType).reduce((acc, val) => acc.concat(val), []);
