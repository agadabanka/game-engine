/* Default hero rig — a neutral toon (Studio.Toon) so a fresh scaffold has a visible, richly
 * animated hero out of the box (idle/run/jump/fall/land + face moods). A scaffolded game replaces
 * this with its own CHARACTER, and tools/art-sprites.mjs overwrites sprites.js with a generated
 * sheet that Studio.Hero auto-prefers — so the same game becomes sprite-driven with no code change. */
window.CHARACTER = { key: 'hero', color: 0x7cc6ff, belly: 0xdcefff, glove: 0xffffff, boot: 0x3a7bd5, w: 40, h: 44, shape: 'round', acc: [], scale: 1 };
