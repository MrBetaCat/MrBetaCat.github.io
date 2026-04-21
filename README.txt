SPRINT CONTENT EDITOR — INSTRUCTIONS
=====================================

SETUP (one-time)
----------------
Run the local dev server from the project root:

    node server.js
    → http://localhost:3000

The server must be running to save any content.
Reading/rendering on the deployed site (https://mrbetacat.github.io/) does not require the server.


HANDOUT
-------
Page: http://localhost:3000/sprint-viewer.html

1. Select a topic from the sidebar (T1, T2, etc.)
2. Click the "Handout" tab
3. Type markdown directly in the text area
4. Saves automatically — 800ms after you stop typing
5. A small "✓ Saved" indicator confirms the save

File written to: content/handout/t{N}.md


BLOG
----
Page: http://localhost:3000/sprint-blog.html

1. Select a topic from the sidebar
2. Fill in: Title, Subtitle, Date, Tags, Body (markdown)
3. Saves automatically — 800ms after you stop typing any field
4. Or click the Save button to force-save immediately

File written to: content/blog/t{N}.md  (YAML frontmatter + markdown body)

Preview at: http://localhost:3000/sprint-blog-preview.html


CODE EXAMPLES
-------------
Page: http://localhost:3000/sprint-blog.html → Code tab

1. Select a topic from the sidebar
2. Click "+ Add Snippet"
3. Give it a name and choose a language (python / typescript / javascript / bash / json / text)
4. Type code in the editor
5. Saves automatically — 800ms after any change (name, language, or body)

File written to: content/code_examples/t{N}.json


DEPLOYING
---------
After editing locally, commit and push the content/ folder to GitHub:

    git add content/
    git commit -m "Add sprint content for T1"
    git push

The deployed site at https://mrbetacat.github.io/ serves these as static files.
No server is needed for reading — only for editing.


CONTENT FILE LAYOUT
-------------------
content/slides/t{N}.b64          — base64-encoded .pptx bytes
content/handout/t{N}.md          — plain markdown
content/blog/t{N}.md             — YAML frontmatter + markdown body
content/code_examples/t{N}.json  — JSON array of code snippets
content/status.json              — manifest: which topics have which files
