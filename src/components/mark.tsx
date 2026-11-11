// The Shelf mark from docs/design/assets/mark.svg, in currentColor so it follows the theme.
export const Mark = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
    <rect x="5" y="8" width="13" height="13" rx="2.5" />
    <circle cx="24" cy="16" r="5" />
    <rect x="3" y="21" width="26.5" height="3.5" rx="1.75" />
  </svg>
);
