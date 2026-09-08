export const sidebarCss = `
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details){box-sizing:border-box;color:var(--dsw-alias-label-primary,#242424);font:13px/1.5 system-ui,sans-serif;letter-spacing:0}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details) *{box-sizing:border-box}
.dsh-space-root{--dsh-space-title-offset:30px;--dsh-space-action-size:24px;display:flex;flex:1;flex-direction:column;min-width:0;min-height:0}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details) button{font:inherit;cursor:pointer}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details) button:disabled{opacity:.45;cursor:not-allowed}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details) :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4787e0);outline-offset:0}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-details) :is(input:not([type=checkbox],[type=radio],[type=range],[type=color]),textarea,select):focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary,#4787e0)}
:is(.dsh-space-heading,.dsh-space-session-main,.dsh-space-section-title,.dsh-space-show-more,.dsh-space-add-member,.dsh-space-details-title){border-radius:4px}
:is(.dsh-space-heading,.dsh-space-session-main,.dsh-space-section-title):focus-visible{outline-offset:-2px}
.dsh-space-dialog:focus{outline:none}
.dsh-space-toolbar-title{flex:1;min-width:0;font-weight:600;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
.dsh-space-toolbar-shell{display:grid;grid-template-columns:minmax(0,1fr);margin:4px calc(var(--dsh-sidebar-inline-padding,12px) + 2px) 6px 2px;min-height:32px}
.dsh-space-toolbar-shell>div{grid-area:1/1;min-width:0;transition:opacity 160ms ease}
.dsh-space-view-toolbar{display:flex;align-items:center;gap:2px}
.dsh-space-toolbar-shell.searching>.dsh-space-view-toolbar{opacity:0;visibility:hidden;pointer-events:none}
.dsh-space-toolbar-spacer{flex:1}
.dsh-space-view-switch{position:relative;display:grid;grid-template-columns:repeat(2,56px);align-items:center;padding:2px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-view-switch:before{content:"";position:absolute;inset:2px auto 2px 2px;width:56px;border-radius:999px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 1px 3px #0001;transition:transform 180ms ease}
.dsh-space-view-switch[data-view=workspaces]:before{transform:translateX(56px)}
.dsh-space-view-switch button{position:relative;display:flex;align-items:center;justify-content:center;gap:4px;min-height:24px;padding:2px 6px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:12px}
.dsh-space-view-switch button[aria-checked=true]{color:var(--dsw-alias-label-primary,#242424)}
.dsh-space-menu-check{margin-left:auto;display:flex}
.group-color-gray{--group-color:#8a8f98}.group-color-red{--group-color:#d7657c}.group-color-orange{--group-color:#d88b41}.group-color-yellow{--group-color:#c4a526}.group-color-green{--group-color:#31a781}.group-color-blue{--group-color:#4a9ed3}.group-color-purple{--group-color:#9e85d5}
.dsh-space-group-symbol{display:flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;border-radius:50%;background:color-mix(in srgb,var(--group-color) 20%,transparent);color:var(--group-color)}
.dsh-space-group-count{min-width:18px;max-width:36px;padding:0 5px;text-align:center;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-group-draft,.dsh-space-group-placeholder{display:flex;align-items:center;gap:6px;min-width:0;min-height:32px;margin:3px 0;padding:3px 6px;border:1px dashed var(--dsw-alias-border-l1,#8885);border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#777);font-size:12px!important}
.dsh-space-group-placeholder{width:100%;text-align:left}
.dsh-space-group-placeholder:hover,.dsh-space-group-draft:is(:hover,:focus-within){background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-group-placeholder>svg,.dsh-space-draft-label{flex:none}
.dsh-space-group-draft>.dsh-space-title{flex:1;text-align:right}
.dsh-space-group-draft>.dsh-space-icon{opacity:0}
.dsh-space-group-draft:is(:hover,:focus-within)>.dsh-space-icon{opacity:1}
@media(hover:none){.dsh-space-group-draft>.dsh-space-icon{opacity:1}}
.dsh-space-section-head>.dsh-space-always-visible{opacity:1!important}
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
.dsh-space-list{--dsh-space-fade-top:0px;--dsh-space-fade-bottom:0px;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 6px 16px 2px;scrollbar-gutter:stable;scroll-padding-block:18px;mask-image:linear-gradient(to bottom,transparent,#000 var(--dsh-space-fade-top),#000 calc(100% - var(--dsh-space-fade-bottom)),transparent),linear-gradient(#000,#000);mask-size:calc(100% - var(--dsh-space-scrollbar-width,0px)) 100%,var(--dsh-space-scrollbar-width,0px) 100%;mask-position:left top,right top;mask-repeat:no-repeat}
.dsh-space-list[data-fade-top]{--dsh-space-fade-top:14px}
.dsh-space-list[data-fade-bottom]{--dsh-space-fade-bottom:18px}
.dsh-space-list-content{display:flow-root;min-width:0}
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
.dsh-space-heading{display:flex;align-items:center;gap:2px;flex:1;min-width:0;min-height:30px;padding:0;border:0;background:transparent;color:inherit;text-align:left}
.dsh-space-workspace-icon{display:grid;place-items:center;flex:none;width:var(--dsh-space-action-size);height:20px;color:var(--dsw-alias-label-secondary,#666)}
.dsh-space-workspace-icon>svg{grid-area:1/1}
.dsh-space-workspace-icon.space{color:var(--dsw-alias-state-business-primary,#4787e0)}
.dsh-space-heading-text{min-width:0;flex:1}
.dsh-space-title{display:block;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-space-session{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:2px;min-width:0;min-height:30px;margin:2px 0;border-radius:6px;padding:0 6px 0 calc(var(--dsh-space-title-offset) - 24px)}
.dsh-space-root .drop-before,.dsh-space-root .drop-after{position:relative}
.dsh-space-root .drop-before::before,.dsh-space-root .drop-after::after{content:'';position:absolute;left:0;right:0;height:2px;background:var(--dsw-alias-state-business-primary,#4787e0);pointer-events:none;z-index:2}
.dsh-space-root .drop-before::before{top:0}
.dsh-space-root .drop-after::after{bottom:0}
.dsh-space-root .drop-assign{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4787e0) 8%,transparent);outline:1px dashed var(--dsw-alias-state-business-primary,#4787e0);outline-offset:-1px;border-radius:6px}
[data-dsh-space-dragging] .dsh-space-root [data-drag-source]{opacity:.5;cursor:grabbing}
.dsh-space-drag-preview{position:fixed;z-index:2147483647;display:flex;align-items:center;gap:8px;width:max-content;max-width:min(300px,calc(100vw - 16px));box-sizing:border-box;padding:7px 11px;border:1px solid var(--dsw-alias-border-l1,#8883);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#242424);box-shadow:0 4px 16px #0003;font-family:inherit;font-size:14px;line-height:20px;pointer-events:none;user-select:none}
.dsh-space-drag-preview svg{flex:none}
.dsh-space-drag-preview span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-space-directory-picker{display:flex;align-items:center;gap:10px;width:100%;min-height:64px;padding:12px 14px;border:0;border-bottom:1px solid var(--dsw-alias-border-l2,#8883);border-radius:0;background:transparent;color:var(--dsw-alias-label-primary,#242424);font:inherit;text-align:left;cursor:pointer}
.dsh-space-directory-picker:last-child{border-bottom:0}
.dsh-space-directory-picker.empty{min-height:120px;flex-direction:column;justify-content:center;gap:10px;font-size:14px;color:var(--dsw-alias-label-secondary,#666)}
.dsh-space-directory-picker.empty>svg{width:24px;height:24px;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-directory-picker:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-directory-picker svg{flex:none}
.dsh-space-directory-picker span{min-width:0;overflow-wrap:anywhere}
.dsh-space-session-actions{display:grid;grid-template-columns:repeat(3,24px);gap:2px;flex:none;width:76px;opacity:0}
.dsh-space-session.project-session:not(.confirming)>.dsh-space-session-actions{grid-template-columns:repeat(2,var(--dsh-space-action-size));width:calc(2 * var(--dsh-space-action-size) + 2px)}
.dsh-space-session-leading{position:relative;display:grid;place-items:center;flex:none;width:var(--dsh-space-action-size);height:var(--dsh-space-action-size)}
.dsh-space-session-leading>.dsh-space-icon{position:absolute;inset:0;opacity:0}
.dsh-space-session:is(:hover,:focus-within):not(.confirming)>.dsh-space-session-leading>.dsh-space-icon{opacity:1}
.dsh-space-session:is(:hover,:focus-within):not(.confirming)>.dsh-space-session-leading.has-status>.dsh-space-status{position:absolute;right:-3px;bottom:-3px;transform:scale(.5);z-index:1;pointer-events:none}
.dsh-space-session-time{position:absolute;right:6px;width:76px;text-align:right;font-size:11px;color:var(--dsw-alias-label-tertiary,#777);pointer-events:none}
.dsh-space-session:is(:hover,:focus-within,.confirming)>.dsh-space-session-time{visibility:hidden}
.dsh-space-groups-view .dsh-space-show-more{margin-left:0}
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
.dsh-space-menu-trigger{position:relative}
.dsh-space-sort-badge{position:absolute;right:1px;bottom:1px;display:flex;background:var(--dsw-alias-bg-layer-1,#fff);border-radius:50%;padding:1px;pointer-events:none}
.dsh-space-head:has(>.dsh-space-menu [aria-expanded=true]),.dsh-space-session:has(>.dsh-space-session-actions .dsh-space-menu [aria-expanded=true]){background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-head:has(>.dsh-space-menu [aria-expanded=true])>:is(.dsh-space-icon,.dsh-space-menu),.dsh-space-session:has(>.dsh-space-session-actions .dsh-space-menu [aria-expanded=true])>.dsh-space-session-actions{opacity:1}
.dsh-space-section-head:has(>.dsh-space-menu [aria-expanded=true])>:is(.dsh-space-icon,.dsh-space-menu){opacity:1}
.dsh-space-session:has(>.dsh-space-session-actions .dsh-space-menu [aria-expanded=true])>.dsh-space-session-time{visibility:hidden}
@media(prefers-reduced-motion:reduce){.dsh-space-view-switch:before{transition:none}}
@media(hover:none){.dsh-space-root{--dsh-space-action-size:32px}.dsh-space-session-leading>.dsh-space-icon{opacity:1}.dsh-space-session-leading.has-status>.dsh-space-status{position:absolute;right:-3px;bottom:-3px;transform:scale(.5);z-index:1;pointer-events:none}.dsh-space-session-time{display:none}}
.dsh-space-menu-backdrop{position:fixed;inset:0;margin:0;width:100vw;height:100dvh;max-width:none;max-height:none;padding:0;border:0;background:transparent;touch-action:none;outline:none}
.dsh-space-menu-panel{position:fixed;inset:auto;margin:0;width:184px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow-y:auto;overscroll-behavior:contain;padding:4px;border:1px solid var(--dsw-alias-border-l1,#8884);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 8px 24px #0002}
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
.dsh-space-toast-icon{display:flex;color:var(--dsw-alias-state-success-primary,#21936b)}
[role=status]:has(.dsh-space-toast-icon){box-sizing:border-box;gap:8px;padding:10px 12px;border-radius:8px;font-size:12px;line-height:18px;overflow-wrap:anywhere}
.dsh-space-search-notice{display:flex;align-items:center;gap:8px;margin:8px 6px 0;padding:10px 2px;border-top:1px solid var(--dsw-alias-border-l2,#8883);color:var(--dsw-alias-label-secondary,#666);font-size:12px}
.dsh-space-search-notice>svg{flex:none;align-self:flex-start;margin-top:2px;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-search-notice-copy{flex:1;min-width:0;overflow-wrap:anywhere}
.dsh-space-search-notice-copy>span,.dsh-space-search-notice-copy>small{display:block}
.dsh-space-search-notice-copy>small{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-tertiary,#777)}
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
.dsh-space-member-list{position:relative;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2,#8883);border-radius:8px;overflow:hidden;margin-top:10px}
.dsh-space-member{border-bottom:1px solid var(--dsw-alias-border-l2,#8883);padding:12px;min-width:0}
.dsh-space-member-head{display:flex;align-items:center;gap:8px;min-height:38px}
.dsh-space-member-head>svg{flex:none}
.dsh-space-member-main{flex:1;min-width:0}
.dsh-space-member-main strong,.dsh-space-member-main small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dsh-space-member-main small{color:var(--dsw-alias-label-tertiary,#777);font-size:11px;white-space:normal;overflow-wrap:anywhere}
.dsh-space-member-options{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin:8px 0 0 24px}
.dsh-space-fields .dsh-space-check{display:flex;flex-direction:row;align-items:center;gap:8px;flex:none;font-weight:400}
.dsh-space-fields input:is([type=checkbox],[type=radio]){width:16px;height:16px;min-height:16px;margin:0;padding:0;flex:none;accent-color:var(--dsw-alias-label-primary,#17181a)}
.dsh-space-fields .dsh-space-link-name{flex:1;display:flex;flex-direction:row;align-items:center;gap:0;min-width:160px;color:var(--dsw-alias-label-secondary,#666);font-size:11px}
.dsh-space-link-name input{min-height:28px;font-size:11px;flex:1;width:0}
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
.dsh-space-detail-workspace{display:flex;align-items:flex-start;align-self:flex-start;gap:6px;min-width:0;max-width:100%;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dsh-space-detail-workspace>svg{flex:none;margin-block:3px}
.dsh-space-detail-workspace>span{min-width:0;overflow-wrap:anywhere}
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
.dsh-space-workspace-name{display:flex;align-items:center;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;overflow:hidden}
.dsh-space-workspace-name>svg{flex:none;box-sizing:content-box;width:18px;height:18px;padding:12px 14px;border-right:1px solid var(--dsw-alias-border-l2,#ddd)}
.dsh-space-workspace-name>input{border:0!important;min-width:0;width:100%}
.dsh-space-workspace-name:focus-within{border-color:var(--dsw-alias-state-business-primary,#4787e0)}
.dsh-space-working-directory{display:flex;align-items:center;gap:10px;padding:12px 14px;min-width:0;border-bottom:1px solid var(--dsw-alias-border-l2,#8883)}
.dsh-space-working-directory:last-child{border-bottom:0}
.dsh-space-working-directory>svg{flex:none}
.dsh-space-directory-title{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:14px;overflow-wrap:anywhere}
.dsh-space-member-main .dsh-space-directory-role{display:inline-block;flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#777);white-space:nowrap}
.dsh-space-working-directory.pending{border-top:1px solid var(--dsw-alias-border-l2,#8883);color:var(--dsw-alias-label-secondary,#666);padding-block:10px}
.dsh-space-working-directory.pending .dsh-space-directory-title{font-size:12px}
.dsh-space-type-switch{display:flex;flex:none;padding:2px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-type-switch button{display:flex;align-items:center;justify-content:center;gap:4px;min-height:28px;padding:4px 8px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-tertiary,#777);font-size:12px}
.dsh-space-type-switch button[aria-checked=true]{color:var(--dsw-alias-label-primary,#242424);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 1px 3px #0002}
.dsh-space-member-primary{width:16px!important;height:16px!important;flex:none;cursor:pointer;accent-color:var(--dsw-alias-label-primary,#17181a)}
.dsh-space-add-member{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:12px;border:0;border-radius:0;background:transparent;color:inherit;text-align:left}
.dsh-space-add-member>svg{flex:none}
.dsh-space-add-member.empty{min-height:120px;flex-direction:column;justify-content:center;gap:10px;color:var(--dsw-alias-label-secondary,#666);font-size:14px}
.dsh-space-add-member.empty>svg{width:24px;height:24px;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-add-member:hover{background:var(--dsw-alias-interactive-bg-hover,#8881)}
.dsh-space-dialog.workspace-editor{width:min(560px,calc(100vw - 24px))}
.workspace-editor .dsh-space-dialog-header{border:0;padding:24px 24px 4px;gap:8px}
.workspace-editor .dsh-space-dialog-header h2{font-size:20px}
.workspace-editor .dsh-space-fields{padding:24px;gap:20px}
.workspace-editor .dsh-space-buttons{border:0;padding:0 24px 24px;gap:10px}
.workspace-editor .dsh-space-button{min-height:36px;border-radius:6px;padding:6px 16px}
.workspace-editor .dsh-space-buttons>.dsh-space-button:not(.primary){border-color:transparent;color:var(--dsw-alias-label-secondary,#666)}
.workspace-editor .dsh-space-button.primary{min-width:88px}
.workspace-editor .dsh-space-workspace-name>input{min-height:44px;font-size:14px;padding-left:14px;background:transparent}
.workspace-editor .dsh-space-inline-heading h3{font-size:14px;font-weight:500}
@media(max-width:480px){.workspace-editor .dsh-space-dialog-header{padding:20px 18px 0}.workspace-editor .dsh-space-dialog-header h2{font-size:18px}.workspace-editor .dsh-space-fields{padding:20px 18px}.workspace-editor .dsh-space-buttons{padding:0 18px 20px}.dsh-space-type-switch button>svg{display:none}.dsh-space-type-switch button{padding-inline:7px}.workspace-editor .dsh-space-button{padding-inline:12px}}
.dsh-space-visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.dsh-space-change-warning{margin:0;padding:10px 12px;border-left:2px solid var(--dsw-alias-state-warning-primary,#b78024);background:var(--dsw-alias-interactive-bg-hover,#8881);font-size:12px;color:var(--dsw-alias-label-secondary,#666);line-height:1.6}
.dsh-space-dialog.compact{width:min(420px,calc(100vw - 24px))}
.compact .dsh-space-dialog-header{border:0}
.compact .dsh-space-fields{gap:14px;padding-top:8px;padding-bottom:12px}
.compact .dsh-space-fields>p{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary,#666)}
.compact .dsh-space-buttons{border:0;padding-top:8px}
.dsh-space-removal-target{display:flex;align-items:center;gap:10px;min-width:0}
.dsh-space-removal-target>div{min-width:0}
.dsh-space-removal-target strong,.dsh-space-removal-target small{display:block;overflow-wrap:anywhere}
.dsh-space-removal-target small{font-size:11px;color:var(--dsw-alias-label-tertiary,#777);margin-top:4px}
@media(hover:none){:is(.dsh-space-head,.dsh-space-session,.dsh-space-section-head)>:is(.dsh-space-icon,.dsh-space-menu){opacity:1}.dsh-space-icon,.dsh-space-root .dsh-space-icon{width:32px;height:32px}.dsh-space-section-title svg{opacity:1}.dsh-space-session-actions{opacity:1;grid-template-columns:repeat(3,32px);width:100px}.dsh-space-archive-confirm{height:32px}.dsh-space-menu-panel button{min-height:40px}}
@media(max-width:480px){.dsh-space-fields{padding:14px;gap:12px}.dsh-space-dialog-header,.dsh-space-buttons{padding:12px 14px}}
@media(hover:none){.dsh-space-details-title svg,.dsh-space-details-header>.dsh-space-icon{opacity:1}}
@media(prefers-reduced-motion:reduce){:is(.dsh-space-status,.dsh-space-detail-status) *{animation:none!important}.dsh-space-toolbar-shell>div,.dsh-space-search{transition:none}}
@media(prefers-reduced-motion:no-preference){.dsh-space-button:disabled svg{animation:dsh-space-spin 1s linear infinite}@keyframes dsh-space-spin{to{transform:rotate(360deg)}}}
`
