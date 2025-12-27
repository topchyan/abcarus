# Contributing to ABCarus

ABCarus is a focused tool with a text-centric architecture. Contributions are welcome, provided they align with the project’s design goals.

## Scope

Contributions should generally fall into one of the following areas:

- ABC parsing and indexing
- Navigation and library management
- Text editing and editor integration
- Notation rendering
- Playback improvements (non-invasive)
- Performance and stability
- Bug fixes and refactoring

Features that significantly increase complexity without clear benefit may be declined.

## Code style

- Use plain JavaScript
- Prefer explicit code over abstractions
- Avoid unnecessary dependencies
- Keep renderer and main process responsibilities clearly separated
- Follow existing project structure and naming conventions

## Commits

- One logical change per commit
- Commit messages should describe *what* changed, not *why*
- Avoid mixing refactors with functional changes

## Pull requests

- Describe the change clearly and concisely
- Reference related issues if applicable
- Ensure the application runs without errors after the change
- UI changes should not break keyboard navigation or basic workflows

## Non-goals

At this stage, the following are not priorities:

- Feature-heavy playback engines
- Complex UI effects
- Format conversions unrelated to ABC
- Opinionated musical transformations without clear use cases

## Discussion

For larger changes, open an issue before starting implementation to discuss scope and approach.

