rm -f recents.zip
{ git diff --name-only -z HEAD -- '*.md' '*.js' '*.mjs' '*.css' '*.html' '*.sh';
  git ls-files -z --others --exclude-standard -- '*.md' '*.js' '*.mjs' '*.css' '*.html' '*.sh';
} | xargs -0 zip -9 recents.zip
