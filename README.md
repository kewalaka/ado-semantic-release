# Semantic Release Azure DevOps pipeline extensions

## Release notes

Generate Release notes based on conventional commits by pipeline step

## release-notes task

Azure pipelines (default parameters):
```yaml
steps:
- task: release-notes@1
  displayName: 'Release notes'
```

Azure pipelines (all parameters):
```yaml
steps:
- task: release-notes@1
  displayName: 'Release notes'
  inputs:
    releaseNotesFrom: 1.0.0
    releaseNotesTo: HEAD
    releaseNotesPath: docs/release-notes.md 
    releaseNotesTemplatePath: src/main/resources/release-notes-template.md
    setVersionToGitTag: true
    gitTagPrefix: v
    gitTagSuffix: alpha
```

## push-git-tag task

**Description:** Push all git tags or only the latest git tag to the ADO git repository

Precondition:

Git credentials, user name and email should be configured before running this task.
See [Microsoft docs page](https://docs.microsoft.com/en-us/azure/devops/pipelines/scripts/git-commands?view=azure-devops&tabs=yaml/) for more information.

Example:
```yaml
steps:
  - checkout: self
    persistCredentials: true
    clean: true
    displayName: "Allow scripts to access the system token"
  - script: |
      git config user.email noreply@example.com
      git config user.name "ADO Build agent"
    displayName: "Configure git user"
```

Azure pipelines (default parameters):
```yaml
steps:
- task: push-git-tag@1
  displayName: 'Push git tag'
```

Azure pipelines (all parameters):
```yaml
steps:
- task: push-git-tag@1
  displayName: 'Push git tag'
  inputs:
    publishLatestTagOnly: true
    remoteName: origin
``` 

## update-yaml

**Description:** Update key:value in the yaml file (e.g. version)

Azure pipelines (minimal allowed parameters):
```yaml
steps:
- task: update-yaml@1
  displayName: 'Update yaml'
  filename: Chart.yaml
  key: version
```

Azure pipelines (all parameters):
```yaml
steps:
- task: update-yaml@1
  displayName: 'Update yaml'
  filename: Chart.yaml
  key: version
  value: 3.2.1 # if omitted will use the latest git tag
  createBackup: true # create a backup of the original file
```

See [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for specification.

---
[Icons by Flaticon](https://www.flaticon.com/free-icons/)
