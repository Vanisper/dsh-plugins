export const sidebarCss = `
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details){box-sizing:border-box;color:var(--dsw-alias-label-primary,#242424);font:13px/1.5 system-ui,sans-serif;letter-spacing:0}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details) *{box-sizing:border-box}
.dsh-space-root{--dsh-space-title-offset:30px;display:flex;flex:1;flex-direction:column;min-width:0;min-height:0}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details) button{font:inherit;cursor:pointer}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details) button:disabled{opacity:.45;cursor:not-allowed}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details) :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4787e0);outline-offset:2px}
.dsh-space-toolbar-title{flex:1;min-width:0;font-weight:600;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
.dsh-space-toolbar-shell{display:grid;grid-template-columns:minmax(0,1fr);margin:4px calc(var(--dsh-sidebar-inline-padding,12px) + 2px) 6px 2px;min-height:32px}
.dsh-space-toolbar-shell>div{grid-area:1/1;min-width:0;transition:opacity 160ms ease}
.dsh-space-view-toolbar{display:flex;align-items:center;gap:2px}
.dsh-space-toolbar-shell.searching>.dsh-space-view-toolbar{opacity:0;visibility:hidden;pointer-events:none}
.dsh-space-toolbar-spacer{flex:1}
.dsh-space-view-switch{display:flex;align-items:center;padding:2px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-view-switch button{display:flex;align-items:center;justify-content:center;gap:4px;min-height:24px;padding:2px 6px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:12px}
.dsh-space-view-switch button[aria-checked=true]{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#242424)}
.dsh-space-menu-check{margin-left:auto;display:flex}
.group-color-gray{--group-color:#8a8f98}.group-color-red{--group-color:#d7657c}.group-color-orange{--group-color:#d88b41}.group-color-yellow{--group-color:#c4a526}.group-color-green{--group-color:#31a781}.group-color-blue{--group-color:#4a9ed3}.group-color-purple{--group-color:#9e85d5}
.dsh-space-group-symbol{display:flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;border-radius:50%;background:color-mix(in srgb,var(--group-color) 20%,transparent);color:var(--group-color)}
.dsh-space-display-group{border-left:2px solid color-mix(in srgb,var(--group-color) 55%,transparent);padding-left:3px}
.dsh-space-group-editor{padding:8px 4px;min-width:0}
.dsh-space-swatches{display:flex;align-items:center;gap:6px;padding-top:8px;flex-wrap:wrap}
.dsh-space-swatches label{position:relative;display:flex!important;align-items:center;justify-content:center;width:24px;height:24px;cursor:pointer}
.dsh-space-swatches input{position:absolute;inset:0;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}
.dsh-space-swatch{display:block;width:16px;height:16px;pointer-events:none;border-radius:50%;background:var(--group-color)}
.dsh-space-swatches input:checked+span{outline:2px solid var(--dsw-alias-label-secondary,#666);outline-offset:3px}
.dsh-space-swatches input:focus-visible+span{outline:2px solid var(--dsw-alias-state-business-primary,#4787e0);outline-offset:3px}
.dsh-space-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666)}
.dsh-space-icon:hover,.dsh-space-menu-panel button:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-icon svg{flex:none}
.dsh-space-root .dsh-space-icon{width:24px;height:24px;border-radius:4px}
.dsh-space-search-wrap{display:flex;align-items:center;gap:6px;padding:0 6px 0 8px;min-height:32px;border:1px solid var(--dsw-alias-border-l2,#8884);border-radius:6px;color:var(--dsw-alias-label-tertiary,#777);opacity:0;visibility:hidden;pointer-events:none}
.dsh-space-toolbar-shell.searching>.dsh-space-search-wrap{opacity:1;visibility:visible;pointer-events:auto}
.dsh-space-search-wrap:focus-within{border-color:var(--dsw-alias-state-business-primary,#4787e0)}
.dsh-space-search{min-width:0;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary,#242424);height:26px;font:inherit;outline:none;clip-path:inset(0 0 0 12%);transition:clip-path 160ms ease}
.dsh-space-toolbar-shell.searching .dsh-space-search{clip-path:inset(0)}
.dsh-space-root .dsh-space-search:focus-visible{outline:none}
.dsh-space-search::-webkit-search-cancel-button{display:none}
.dsh-space-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 6px 16px;scrollbar-gutter:stable}
.dsh-space-group{margin:2px 0 8px;min-width:0}
.dsh-space-section{margin:6px 0 12px;min-width:0}
.dsh-space-section-head{display:flex;align-items:center;gap:2px;min-height:28px;padding:0 4px}
.dsh-space-section-title{display:flex;align-items:center;gap:6px;flex:1;min-width:0;padding:5px 2px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#777);text-align:left;font-size:12px!important}
.dsh-space-section-title>svg{flex:none;opacity:0}
.dsh-space-section-title[aria-expanded=false]>svg,.dsh-space-section-head:is(:hover,:focus-within) .dsh-space-section-title>svg{opacity:1}
.dsh-space-section-empty{padding:4px 6px;color:var(--dsw-alias-label-tertiary,#777);font-size:12px}
.dsh-space-show-more{display:block;margin:2px 0 4px 20px;padding:4px 6px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#777);font-size:12px!important}
.dsh-space-show-more:hover{color:var(--dsw-alias-label-primary,#242424)}
.dsh-space-head{display:flex;align-items:center;gap:2px;min-height:30px;margin:2px 0;border-radius:6px;padding:0 6px}
.dsh-space-heading{display:flex;align-items:center;gap:8px;flex:1;min-width:0;min-height:30px;padding:0;border:0;background:transparent;color:inherit;text-align:left}
.dsh-space-workspace-icon{display:grid;place-items:center;flex:none;width:16px;height:20px;color:var(--dsw-alias-label-secondary,#666)}
.dsh-space-workspace-icon>svg{grid-area:1/1}
.dsh-space-workspace-icon.space{color:var(--dsw-alias-state-business-primary,#4787e0)}
.dsh-space-heading-text{min-width:0;flex:1}
.dsh-space-title{display:block;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-space-session{display:flex;flex-wrap:wrap;align-items:center;gap:2px;min-width:0;min-height:30px;margin:2px 0;border-radius:6px;padding:0 6px 0 calc(var(--dsh-space-title-offset) - 24px)}
.dsh-space-session.drop-before,.dsh-space-group.drop-before>.dsh-space-head{box-shadow:inset 0 2px var(--dsw-alias-state-business-primary,#4787e0)}
.dsh-space-session.drop-after,.dsh-space-group.drop-after>.dsh-space-head{box-shadow:inset 0 -2px var(--dsw-alias-state-business-primary,#4787e0)}
.dsh-space-session-actions{display:grid;grid-template-columns:repeat(3,24px);gap:2px;flex:none;width:76px;opacity:0}
.dsh-space-session:is(:hover,:focus-within,.confirming)>.dsh-space-session-actions{opacity:1}
.dsh-space-archive-confirm{grid-column:span 2;height:24px;border:0;border-radius:4px;background:var(--dsw-alias-state-error-primary,#c44242);color:white;font-size:12px!important;padding:0 4px}
.dsh-space-archive-error{flex-basis:100%;overflow-wrap:anywhere;font-size:12px;padding:3px 0 7px}
.dsh-space-archive-row{padding:10px 6px;border-bottom:1px solid var(--dsw-alias-border-l2,#8882)}
.dsh-space-archive-heading,.dsh-space-archive-meta{display:flex;align-items:center;gap:6px;min-width:0}
.dsh-space-archive-heading strong{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:500}
.dsh-space-archive-heading time{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-archive-meta{margin-top:6px;color:var(--dsw-alias-label-secondary,#666);font-size:11px}
.dsh-space-archive-meta>svg{flex:none}
.dsh-space-archive-owner{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-space-planned{display:inline-flex;flex:none;cursor:not-allowed;border-radius:4px}
.dsh-space-planned-notice{display:flex;align-items:flex-start;gap:6px;padding:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-planned-notice svg{flex:none;margin-top:2px}
.dsh-space-session.flat{padding-left:6px}
.dsh-space-head:hover,.dsh-space-head.current{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-session:hover,.dsh-space-session.current{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-session.current .dsh-space-session-title{font-weight:500}
.dsh-space-session-main{display:flex;align-items:center;gap:8px;min-width:0;flex:1;border:0;background:transparent;text-align:left;color:inherit;padding:4px 0;min-height:30px}
.dsh-space-session-title{flex:1;min-width:0;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dsh-space-status{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:20px}
.dsh-space-count{font-size:10px;color:var(--dsw-alias-label-tertiary,#777);flex:none}
:is(.dsh-space-head,.dsh-space-session,.dsh-space-section-head)>:is(.dsh-space-icon,.dsh-space-menu){opacity:0}
:is(.dsh-space-head,.dsh-space-session,.dsh-space-section-head):is(:hover,:focus-within)>:is(.dsh-space-icon,.dsh-space-menu){opacity:1}
.dsh-space-menu{flex:none;display:inline-flex}
.dsh-space-menu-panel{position:fixed;inset:auto;margin:0;width:184px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow-y:auto;padding:4px;border:1px solid var(--dsw-alias-border-l1,#8884);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 8px 24px #0002}
.dsh-space-menu-panel button{display:flex;align-items:center;gap:8px;width:100%;min-height:28px;padding:4px 7px;text-align:left;color:inherit;border:0;border-radius:4px;background:transparent;cursor:pointer}
.dsh-space-menu-panel button>svg{width:14px;height:14px;flex:none;color:var(--dsw-alias-label-tertiary,#81858c)}
.dsh-space-menu-panel button.danger>svg{color:inherit}
.dsh-space-menu-panel [role=separator]{height:1px;margin:4px 3px;background:var(--dsw-alias-border-l2,#8883)}
.dsh-space-rename-input{box-sizing:border-box;width:100%;padding:12px 16px;border:1px solid var(--dsw-alias-border-l1,#8884);border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary,#242424);font:inherit;outline:none}
.dsh-space-rename-input:focus-visible{border-color:var(--dsw-alias-state-business-primary,#4787e0)}
.dsh-space-rename-error{margin-top:8px;font-size:13px;color:var(--dsw-alias-state-error-primary,#c44242)}
.dsh-space-menu-panel button.danger,.dsh-space-error{color:var(--dsw-alias-state-error-primary,#c44242)}
.dsh-space-empty{padding:12px 16px;color:var(--dsw-alias-label-tertiary,#777);font-size:12px}
.dsh-space-empty-title{display:block;color:var(--dsw-alias-label-secondary,#666);font-weight:600;margin:4px 0 12px}
.dsh-space-notice{padding:8px 12px;font-size:12px;overflow-wrap:anywhere}
.dsh-space-notice button{margin-left:4px}
.dsh-space-muted{color:var(--dsw-alias-label-tertiary,#777);font-size:12px;overflow-wrap:anywhere}
.dsh-space-feedback{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-state-success-primary,#21936b);padding:4px 12px;font-size:11px}
.dsh-space-search-row{display:block;width:100%;padding:8px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:left}
.dsh-space-search-row:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-search-row strong,.dsh-space-search-row small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dsh-space-search-row small{color:var(--dsw-alias-label-tertiary,#777);font-size:11px}
.dsh-space-rail{align-items:center;gap:10px;padding-top:8px}
.dsh-space-root.dsh-space-rail>.dsh-space-icon{width:36px;height:36px}
.dsh-space-dialog{position:fixed;inset:0;margin:auto;width:min(600px,calc(100vw - 24px));max-width:none;max-height:calc(100dvh - 24px);padding:0;border:1px solid var(--dsw-alias-border-l1,#8884);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 18px 72px #0004}
.dsh-space-dialog::backdrop{background:#0006}
.dsh-space-form{display:flex;flex-direction:column;max-height:calc(100dvh - 26px);margin:0}
.dsh-space-dialog-header{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--dsw-alias-border-l2,#8883);flex:none}
.dsh-space-dialog-header h2{margin:0;flex:1;font-size:16px;font-weight:600;min-width:0;overflow-wrap:anywhere}
.dsh-space-dialog-body{min-height:0;overflow-y:auto}
.dsh-space-fields{display:flex;flex-direction:column;gap:16px;min-width:0;border:0;margin:0;padding:20px}
.dsh-space-fields label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:500;min-width:0}
.dsh-space-fields input,.dsh-space-fields textarea,.dsh-space-fields select{width:100%;min-width:0;min-height:34px;border:1px solid var(--dsw-alias-border-l2,#8885);border-radius:5px;padding:6px 9px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;font-weight:400}
.dsh-space-fields textarea{min-height:58px;resize:vertical}
.dsh-space-fields input:disabled,.dsh-space-fields textarea:disabled,.dsh-space-fields select:disabled{opacity:.6}
.dsh-space-buttons{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid var(--dsw-alias-border-l2,#8883);flex:none}
.dsh-space-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:5px 12px;border:1px solid var(--dsw-alias-border-l2,#8884);border-radius:5px;background:transparent;color:inherit;white-space:normal}
.dsh-space-button:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-button.primary{background:var(--dsw-alias-label-primary,#292929);color:var(--dsw-alias-bg-layer-1,#fff);border-color:transparent}
.dsh-space-button.danger{background:var(--dsw-alias-state-error-primary,#c44242);color:white;border-color:transparent}
.dsh-space-path-field{display:flex;align-items:center;gap:6px;min-width:0}
.dsh-space-path-field input{flex:1}
.dsh-space-member-list{position:relative;display:flex;flex-direction:column;border-top:1px solid var(--dsw-alias-border-l2,#8883)}
.dsh-space-member{border-bottom:1px solid var(--dsw-alias-border-l2,#8883);padding:10px 0;min-width:0}
.dsh-space-member-head{display:flex;align-items:center;gap:8px;min-height:38px}
.dsh-space-member-main{flex:1;min-width:0}
.dsh-space-member-main strong,.dsh-space-member-main small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dsh-space-member-main small{color:var(--dsw-alias-label-tertiary,#777);font-size:11px;white-space:normal;overflow-wrap:anywhere}
.dsh-space-member-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:10px}
.dsh-space-member-fields>.full{grid-column:1/-1}
.dsh-space-member details>summary{cursor:pointer;font-size:11px;color:var(--dsw-alias-label-secondary,#666);width:fit-content;margin-top:3px}
.dsh-space-badge{font-size:10px;color:var(--dsw-alias-state-business-primary,#4382d8);font-weight:500;margin-left:6px}
.dsh-space-inline-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsh-space-inline-heading h3{font-size:13px;margin:0}
.dsh-space-directory-row{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-space-directory-row code{display:block;font-size:11px;overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-details{--dsw-alias-label-primary:#f5f5f6;--dsw-alias-label-secondary:#cfd3d6;--dsw-alias-label-tertiary:#b5b8bd;--dsw-alias-border-l2:#ffffff24;--dsw-alias-interactive-bg-hover:#ffffff12;--dsw-alias-state-error-primary:#ff8f8f;color:#f5f5f6;position:fixed;inset:auto;margin:0;width:min(320px,calc(100vw - 16px));max-height:calc(100dvh - 16px);overflow:auto;padding:8px 10px;border:1px solid #ffffff12;border-radius:8px;background:#29292c;box-shadow:0 8px 24px #0002}
.dsh-space-details-header{display:flex;align-items:center;gap:4px;margin-bottom:2px}
.dsh-space-detail-time{flex:none;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-space-name-editor{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
.dsh-space-detail-type{display:flex;align-items:center;min-height:24px;flex:none}
.dsh-space-name-editor:has(input) .dsh-space-detail-type{min-height:32px}
.dsh-space-details-title{display:flex;align-items:baseline;gap:6px;min-width:0;flex:1;border:0;padding:2px 0;background:transparent;color:inherit;text-align:left;font-size:13px!important;font-weight:500!important;overflow-wrap:anywhere}
.dsh-space-details-title svg{flex:none;align-self:center;color:var(--dsw-alias-label-tertiary);opacity:0}
.dsh-space-details-header>.dsh-space-icon{width:24px;height:24px}
.dsh-space-details-title:is(:hover,:focus-visible) svg{opacity:1}
.dsh-space-details-body,.dsh-space-detail-meta{display:flex;flex-direction:column;gap:2px;border:0;padding:0;margin:0;min-width:0}
.dsh-space-detail-status{display:flex;align-items:center;gap:8px;min-height:20px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dsh-space-detail-path{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:4px 0;border:0;border-radius:4px;background:transparent;text-align:left;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dsh-space-detail-path:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-space-detail-path svg{flex:none}
.dsh-space-detail-path>svg:last-child:not(:first-child){opacity:0}
.dsh-space-detail-path:is(:hover,:focus-visible)>svg:last-child{opacity:1}
.dsh-space-detail-path code{flex:1;min-width:0;font:12px/1.4 system-ui,sans-serif;overflow-wrap:anywhere}
.dsh-space-path-text>span{display:inline-block;max-width:100%;vertical-align:top;overflow-wrap:anywhere;word-break:normal}
.dsh-space-detail-members{border-top:1px solid var(--dsw-alias-border-l2);padding-top:6px;margin-top:2px}
.dsh-space-detail-member-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.dsh-space-detail-member-text>span{color:var(--dsw-alias-label-primary)}
.dsh-space-detail-member-text:has(>span)>code{color:var(--dsw-alias-label-tertiary)}
.dsh-space-detail-caption{margin:0 0 2px 24px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-space-details-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:4px;margin-top:2px}
.dsh-space-detail-edit{display:flex;align-items:center;gap:8px;margin-right:auto;padding:4px 0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px!important}
.dsh-space-detail-edit:hover{color:var(--dsw-alias-label-primary)}
.dsh-space-inline-rename{display:flex;align-items:center;gap:3px;width:100%;min-width:0;margin:0}
.dsh-space-inline-rename input{flex:1;min-width:0;height:32px;padding:4px 6px;border:1px solid var(--dsw-alias-border-l2,#8885);border-radius:4px;background:transparent;color:inherit;font:inherit}
.dsh-space-dialog-secondary{margin-right:auto}
.dsh-space-dialog-secondary .dsh-space-button.danger{color:var(--dsw-alias-state-error-primary,#c83232);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c83232) 10%,transparent);border-color:transparent}
.dsh-space-workspace-name{display:flex;align-items:center;gap:10px;padding-left:10px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:6px}
.dsh-space-workspace-name>svg{flex:none}
.dsh-space-workspace-name>input{border:0!important;min-width:0;width:100%}
.dsh-space-workspace-path{display:flex;flex-direction:column;gap:4px;color:var(--dsw-alias-label-tertiary,#777);font-size:12px}
.dsh-space-workspace-path>code{font:inherit;overflow-wrap:anywhere}
.dsh-space-enhance{display:flex!important;flex-direction:row!important;align-items:center;gap:8px!important}
.dsh-space-enhance>input{width:16px!important;height:16px!important;flex:none}
.dsh-space-member-primary{width:16px!important;height:16px!important;flex:none;cursor:pointer;accent-color:var(--dsw-alias-label-primary,#17181a)}
.dsh-space-member-fields output{padding:7px 0;color:var(--dsw-alias-label-tertiary,#777);overflow-wrap:anywhere}
.dsh-space-add-member{display:flex;align-items:center;gap:8px;width:100%;padding:10px 0;border:0;background:transparent;color:inherit;text-align:left}
.dsh-space-add-member:hover{background:var(--dsw-alias-interactive-bg-hover,#8881)}
.dsh-space-member-manual>summary{font-size:12px;color:var(--dsw-alias-label-tertiary,#777);cursor:pointer}
.dsh-space-member-manual[open]>.dsh-space-path-field{margin-top:8px}
@media(hover:none){:is(.dsh-space-head,.dsh-space-session,.dsh-space-section-head)>:is(.dsh-space-icon,.dsh-space-menu){opacity:1}.dsh-space-icon,.dsh-space-root .dsh-space-icon{width:32px;height:32px}.dsh-space-section-title svg{opacity:1}.dsh-space-session-actions{opacity:1;grid-template-columns:repeat(3,32px);width:100px}.dsh-space-archive-confirm{height:32px}.dsh-space-menu-panel button{min-height:40px}}
@media(max-width:480px){.dsh-space-fields{padding:14px;gap:12px}.dsh-space-dialog-header,.dsh-space-buttons{padding:12px 14px}.dsh-space-member-fields{grid-template-columns:1fr}.dsh-space-member-head{gap:4px}}
@media(hover:none){.dsh-space-details-title svg,.dsh-space-details-header>.dsh-space-icon{opacity:1}}
@media(prefers-reduced-motion:reduce){:is(.dsh-space-status,.dsh-space-detail-status) *{animation:none!important}.dsh-space-toolbar-shell>div,.dsh-space-search{transition:none}}
@media(prefers-reduced-motion:no-preference){.dsh-space-button:disabled svg{animation:dsh-space-spin 1s linear infinite}@keyframes dsh-space-spin{to{transform:rotate(360deg)}}}
`
