export const preparationCss = `
.dsh-space-preparation { display:flex; flex-direction:column; min-width:0; height:100%; overflow:auto; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); letter-spacing:0; }
.dsh-space-preparation-header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 24px; font-size:12px; color:var(--dsw-alias-label-tertiary); }
.dsh-space-preparation-body { width:min(720px,calc(100% - 48px)); margin:auto; padding:48px 0 100px; }
.dsh-space-preparation h1 { font-size:24px; font-weight:550; margin:0 0 24px; line-height:1.3; overflow-wrap:anywhere; }
.dsh-space-preparation-target { display:flex; align-items:center; min-width:0; gap:4px; margin-bottom:12px; }
.dsh-space-target-button { display:flex; align-items:center; gap:8px; min-width:0; max-width:100%; padding:6px 8px; border:0; border-radius:6px; background:transparent; color:inherit; font:inherit; cursor:pointer; }
.dsh-space-target-button > span { min-width:0; overflow-wrap:anywhere; text-align:left; }
.dsh-space-target-button > svg { flex-shrink:0; }
.dsh-space-target-button:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-space-target-button:disabled { cursor:default; }
.dsh-space-preparation-context { color:var(--dsw-alias-label-secondary); font-size:12px; line-height:1.6; margin:0 8px 20px; }
.dsh-space-preparation-context p { margin:0; overflow-wrap:anywhere; }
.dsh-space-preparation-members { display:flex; gap:6px 16px; flex-wrap:wrap; margin-top:8px; }
.dsh-space-preparation-members > span { display:flex; align-items:center; gap:4px; overflow-wrap:anywhere; }
.dsh-space-preparation-form { border:1px solid var(--dsw-alias-border-l2,#8884); border-radius:8px; overflow:hidden; background:var(--dsw-alias-bg-l1,var(--dsw-alias-bg-base)); }
.dsh-space-preparation-form:focus-within { border-color:var(--dsw-alias-label-tertiary,#888); }
.dsh-space-preparation textarea { box-sizing:border-box; display:block; width:100%; min-width:0; min-height:160px; max-height:360px; padding:18px; resize:vertical; border:0; outline:none; background:transparent; color:inherit; font:inherit; font-size:15px; line-height:1.6; }
.dsh-space-preparation textarea::placeholder { color:var(--dsw-alias-label-tertiary); }
.dsh-space-preparation-tools { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 12px 12px; }
.dsh-space-preparation-tools-end { display:flex; align-items:center; gap:8px; flex-shrink:0; }
.dsh-space-full-input { display:flex; align-items:center; gap:6px; min-width:0; background:transparent; border:0; border-radius:6px; padding:6px; color:var(--dsw-alias-label-secondary); font:inherit; font-size:12px; cursor:pointer; }
.dsh-space-full-input:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-space-send { width:34px; height:34px; display:grid; place-items:center; border:0; border-radius:50%; color:var(--dsw-alias-bg-base,#fff); background:var(--dsw-alias-label-primary,#222); cursor:pointer; }
.dsh-space-preparation button:disabled { opacity:.5; cursor:not-allowed; }
.dsh-space-preparation-status { margin:12px 6px 0; color:var(--dsw-alias-label-tertiary); font-size:12px; line-height:1.6; }
.dsh-space-preparation [role=alert],.dsh-space-preparation [role=status] { overflow-wrap:anywhere; }
.dsh-space-target-list { display:flex; flex-direction:column; gap:2px; margin-top:12px; }
.dsh-space-target-list > button { display:flex; align-items:center; gap:12px; width:100%; padding:10px 8px; border:0; border-radius:6px; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
.dsh-space-target-list > button:hover,.dsh-space-target-list > button[aria-pressed=true] { background:var(--dsw-alias-interactive-bg-hover,#8882); }
.dsh-space-target-list > button > span { flex:1; min-width:0; overflow-wrap:anywhere; }
.dsh-space-target-list svg { flex-shrink:0; }
.dsh-space-target-list small { display:block; color:var(--dsw-alias-label-tertiary); font-size:12px; margin-top:4px; overflow-wrap:anywhere; }
.dsh-space-handoff,.dsh-space-resume { margin:8px 0; color:var(--dsw-alias-label-secondary); font:inherit; font-size:12px; }
.dsh-space-resume { border:0; background:transparent; text-decoration:underline; cursor:pointer; }
@media(max-width:600px) {
  .dsh-space-preparation-header { padding:12px; }
  .dsh-space-preparation-body { width:calc(100% - 24px); padding:24px 0; }
  .dsh-space-preparation textarea { padding:12px; }
  .dsh-space-preparation-tools { flex-wrap:wrap; }
  .dsh-space-preparation-tools-end { margin-left:auto; }
}
`
