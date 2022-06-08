# Semantic Release Azure DevOps pipeline extensions

## Release notes

Generate Release notes based on conventional commits by pipeline step

## Examples

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
    releaseNotesVersion: 2.0.0
```

See [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for specification.

---
[Icons by Flaticon](https://www.flaticon.com/free-icons/)
