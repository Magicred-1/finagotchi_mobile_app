/**
 * Branded token icons from web3icons.io (https://www.web3icons.io/tokens),
 * inlined as SvgXml markup so they ship in the bundle (no network, no SVG
 * transformer) and stay crisp at any size. Source: 0xa3k5/web3icons,
 * packages/core/src/svgs/tokens/branded — MIT licensed.
 */

export const SOL_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
    <path fill="url(#SOL__a)" d="M18.413 7.903a.62.62 0 0 1-.411.164H3.58c-.512 0-.77-.585-.416-.929l2.368-2.283a.6.6 0 0 1 .41-.169h14.479c.517 0 .77.59.41.934z"/>
    <path fill="url(#SOL__b)" d="M18.413 19.157a.6.6 0 0 1-.411.157H3.58c-.512 0-.77-.58-.416-.923l2.368-2.289a.6.6 0 0 1 .41-.163h14.479c.517 0 .77.585.41.928z"/>
    <path fill="url(#SOL__c)" d="M18.413 10.472a.6.6 0 0 0-.411-.158H3.58c-.512 0-.77.58-.416.922l2.368 2.29a.62.62 0 0 0 .41.163h14.479c.517 0 .77-.585.41-.928z"/>
    <defs>
        <linearGradient id="SOL__a" x1="3.001" x2="21.431" y1="16.322" y2="15.591" gradientUnits="userSpaceOnUse">
            <stop stop-color="#599DB0"/>
            <stop offset="1" stop-color="#47F8C3"/>
        </linearGradient>
        <linearGradient id="SOL__b" x1="3.001" x2="21.323" y1="16.973" y2="16.366" gradientUnits="userSpaceOnUse">
            <stop stop-color="#C44FE2"/>
            <stop offset="1" stop-color="#73B0D0"/>
        </linearGradient>
        <linearGradient id="SOL__c" x1="4.035" x2="20.302" y1="12.002" y2="12.002" gradientUnits="userSpaceOnUse">
            <stop stop-color="#778CBF"/>
            <stop offset="1" stop-color="#5DCDC9"/>
        </linearGradient>
    </defs>
</svg>`;

export const USDC_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
    <path fill="#0B53BF" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18"/>
    <path fill="#fff" d="M13.62 5.45v1.159a5.64 5.64 0 0 1 4.005 5.394 5.64 5.64 0 0 1-4.005 5.394v1.16a6.74 6.74 0 0 0 5.13-6.554 6.74 6.74 0 0 0-5.13-6.553m-7.245 6.553a5.64 5.64 0 0 1 4.005-5.394V5.45a6.74 6.74 0 0 0-5.13 6.553 6.74 6.74 0 0 0 5.13 6.553v-1.159a5.63 5.63 0 0 1-4.005-5.394"/>
    <path fill="#fff" d="M14.419 13.258c0-2.301-3.606-1.356-3.606-2.627 0-.456.366-.748 1.063-.748.833 0 1.12.405 1.21.95h1.147c-.102-1.024-.69-1.67-1.67-1.863v-.904h-1.125v.872c-1.075.137-1.75.762-1.75 1.693 0 2.312 3.611 1.445 3.611 2.694 0 .472-.455.787-1.226.787-1.007 0-1.339-.444-1.462-1.057H9.49c.073 1.122.764 1.823 1.947 1.999v.886h1.125v-.875c1.153-.149 1.856-.82 1.856-1.807"/>
</svg>`;

/** Branded SVG markup by ticker for the two funding tokens. */
export const BRAND_TOKEN_ICONS: Record<string, string> = {
    SOL: SOL_ICON_SVG,
    USDC: USDC_ICON_SVG,
};
