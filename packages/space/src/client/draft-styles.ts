export const draftCss = `
.dsh-space-draft-actions { display:inline-flex; align-items:center; gap:4px; min-width:0; }
.dsh-space-draft-plan { display:inline-flex; align-items:center; justify-content:center; min-height:28px; min-width:38px; border:0; border-radius:6px; padding:4px 6px; background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:12px; cursor:pointer; }
.dsh-space-draft-plan[aria-checked=true] { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
.dsh-space-draft-plan:disabled { opacity:.5; cursor:not-allowed; }
.dsh-space-draft-menu { width:min(272px,calc(100vw - 16px)); max-height:calc(100dvh - 16px); }
.dsh-space-draft-menu button { min-height:40px; }
.dsh-space-draft-menu button[aria-disabled=true] { color:var(--dsw-alias-label-tertiary,#777); cursor:not-allowed; }
.dsh-space-draft-menu button > svg { flex-shrink:0; }
.dsh-space-draft-menu button > span { min-width:0; overflow-wrap:anywhere; }
.dsh-space-draft-menu small { display:block; margin-top:2px; font-size:12px; }
.dsh-space-target-list { display:flex; flex-direction:column; gap:2px; margin-top:12px; }
.dsh-space-target-list > button { display:flex; align-items:center; gap:12px; width:100%; padding:10px 8px; border:0; border-radius:6px; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
.dsh-space-target-list > button:hover,.dsh-space-target-list > button[aria-pressed=true] { background:var(--dsw-alias-interactive-bg-hover,#8882); }
.dsh-space-target-list > button:disabled { opacity:.5; cursor:not-allowed; }
.dsh-space-target-list > button > span { flex:1; min-width:0; overflow-wrap:anywhere; }
.dsh-space-target-list svg { flex-shrink:0; }
.dsh-space-target-list small { display:block; color:var(--dsw-alias-label-tertiary); font-size:12px; margin-top:4px; overflow-wrap:anywhere; }
`
