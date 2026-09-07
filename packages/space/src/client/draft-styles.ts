export const draftCss = `
.dsh-space-draft-actions { display:inline-flex; align-items:center; gap:4px; min-width:0; }
[data-dsh-draft-command][aria-disabled=true] { opacity:.5; cursor:not-allowed; }
[data-dsh-draft-overlay] div[role=option] { display:grid; grid-template-columns:minmax(0,1fr) auto; row-gap:2px; }
[data-dsh-draft-overlay] div[role=option] > span { grid-column:1; white-space:normal; overflow-wrap:anywhere; }
[data-dsh-draft-overlay] div[role=option] > span:has(svg) { grid-column:2; grid-row:1 / span 2; }
.dsh-space-target-list { display:flex; flex-direction:column; gap:2px; margin-top:12px; }
.dsh-space-target-list > button { display:flex; align-items:center; gap:12px; width:100%; padding:10px 8px; border:0; border-radius:6px; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
.dsh-space-target-list > button:hover,.dsh-space-target-list > button[aria-pressed=true] { background:var(--dsw-alias-interactive-bg-hover,#8882); }
.dsh-space-target-list > button:disabled { opacity:.5; cursor:not-allowed; }
.dsh-space-target-list > button > span { flex:1; min-width:0; overflow-wrap:anywhere; }
.dsh-space-target-list svg { flex-shrink:0; }
.dsh-space-target-list small { display:block; color:var(--dsw-alias-label-tertiary); font-size:12px; margin-top:4px; overflow-wrap:anywhere; }
`
