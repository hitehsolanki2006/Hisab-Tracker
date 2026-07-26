import React from 'react';
import Svg, { Path, Rect, Circle, Polyline } from 'react-native-svg';

// Custom SVG wrapper to ensure consistent sizing and color injection
const createIcon = (draw) => {
  return ({ size = 24, color = '#5F707A', ...props }) => (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {draw(color)}
    </Svg>
  );
};

// 1. Home / Wallet: A stylized leather pocket with coin slot and stitch line
export const WalletIcon = createIcon((color) => (
  <>
    <Path d="M19 5H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z" />
    <Path d="M12 5v14" strokeDasharray="2,2" strokeWidth="1.5" opacity="0.6" />
    <Path d="M16 9h4v4h-4z" fill="#4FD1AE22" />
    <Circle cx="18" cy="11" r="1.5" fill={color} />
  </>
));

// 2. PiggyBank / Account: Stylized animal bank shape
export const PiggyBankIcon = createIcon(() => (
  <>
    <Path d="M19 12a7 7 0 0 0-7-7c-2.4 0-4.5 1.2-5.7 3H3a1 1 0 0 0-1 1v3c0 .6.4 1 1 1h.4A5 5 0 0 0 7 17v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1.1c.3.1.7.1 1 .1h2c.3 0 .7 0 1-.1V19a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2.2a7 7 0 0 0 2.6-4.8z" />
    <Path d="M10 5a2 2 0 0 0-4 0" />
    <Circle cx="14" cy="10" r="1" fill="#8CA0A8" />
  </>
));

// 3. ArrowLeftRight / Transfer: Parallel opposite arrows
export const TransferIcon = createIcon(() => (
  <>
    <Path d="M17 3 21 7 17 11" />
    <Path d="M3 7H21" />
    <Path d="M7 21 3 17 7 13" />
    <Path d="M21 17H3" />
  </>
));

// 4. Users / Given to others: Two user silhouettes
export const UsersIcon = createIcon(() => (
  <>
    <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <Circle cx="9" cy="7" r="4" />
    <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>
));

// 5. Landmark / Held: Greek pillar bank icon
export const LandmarkIcon = createIcon(() => (
  <>
    <Path d="M3 22h18" />
    <Path d="M6 18v-7" />
    <Path d="M10 18v-7" />
    <Path d="M14 18v-7" />
    <Path d="M18 18v-7" />
    <Path d="M3 11h18" strokeWidth="2.5" />
    <Path d="M12 2 2 7h20L12 2z" />
  </>
));

// 6. Plus / Add
export const PlusIcon = createIcon(() => (
  <>
    <Path d="M12 5v14" />
    <Path d="M5 12h14" />
  </>
));

// 7. X / Close
export const XIcon = createIcon(() => (
  <>
    <Path d="M18 6 6 18" />
    <Path d="M6 6 18 18" />
  </>
));

// 8. TrendingUp / Income: Arrow going up out of coin base
export const TrendingUpIcon = createIcon(() => (
  <>
    <Polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <Polyline points="16 7 22 7 22 13" />
  </>
));

// 9. TrendingDown / Spend: Arrow going down
export const TrendingDownIcon = createIcon(() => (
  <>
    <Polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
    <Polyline points="16 17 22 17 22 11" />
  </>
));

// 10. AlertCircle
export const AlertCircleIcon = createIcon(() => (
  <>
    <Circle cx="12" cy="12" r="10" />
    <Path d="M12 8v4" />
    <Path d="M12 16h.01" />
  </>
));

// 11. HandCoins / Owe: Hand extending with coins floating above
export const OweIcon = createIcon(() => (
  <>
    <Path d="M14 18H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2c1.1 0 2 .9 2 2v2" />
    <Path d="M2 12h6" />
    <Path d="M12 18H22a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-3" />
    <Circle cx="13" cy="5" r="2" fill="#4FD1AE22" />
    <Circle cx="18" cy="6" r="1.5" />
  </>
));

// 12. History: Clock with circular arrow
export const HistoryIcon = createIcon(() => (
  <>
    <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <Path d="M3 3v5h5" />
    <Path d="M12 7v5l4 2" />
  </>
));

// 13. Pencil / Edit: Drawing tool
export const PencilIcon = createIcon(() => (
  <>
    <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </>
));

// 14. Trash / Delete bin
export const TrashIcon = createIcon(() => (
  <>
    <Path d="M3 6h18" />
    <Path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <Path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <Path d="M10 11v6" />
    <Path d="M14 11v6" />
  </>
));

// 15. Gear / Settings: Cog icon
export const GearIcon = createIcon(() => (
  <>
    <Circle cx="12" cy="12" r="3" />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>
));
