import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type SpriteProps = {
    size?: number;
};

// Stage 1: Crypto Egg
export const Stage1Egg = ({ size = 120 }: SpriteProps) => (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        {/* Base Glow */}
        <Circle cx="50" cy="50" r="38" fill="#9945FF" opacity="0.15" />
        {/* Egg Base */}
        <Path
            d="M50 15C32 15 22 38 22 58C22 75 34 85 50 85C66 85 78 75 78 58C78 38 68 15 50 15Z"
            fill="#E2E8F0"
        />
        {/* Crypto Emblem */}
        <Path
            d="M38 42H62M38 50H62M38 58H62"
            stroke="#14F195"
            strokeWidth="4"
            strokeLinecap="round"
        />
    </Svg>
);

// Stage 2: Coinling (Character)
export const Stage2Coinling = ({ size = 120 }: SpriteProps) => (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        {/* Coin Body */}
        <Circle cx="50" cy="48" r="32" fill="#FBBF24" stroke="#F59E0B" strokeWidth="4" />
        <Circle cx="50" cy="48" r="25" fill="#FCD34D" />
        {/* Eyes */}
        <Circle cx="42" cy="44" r="4" fill="#0F172A" />
        <Circle cx="58" cy="44" r="4" fill="#0F172A" />
        {/* Smile */}
        <Path d="M44 54 Q50 60 56 54" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
        {/* Feet */}
        <Rect x="38" y="76" width="8" height="10" rx="4" fill="#F59E0B" />
        <Rect x="54" y="76" width="8" height="10" rx="4" fill="#F59E0B" />
    </Svg>
);

// Stage 3: Hodler Mascot
export const Stage3Hodler = ({ size = 120 }: SpriteProps) => (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        {/* Hood */}
        <Path
            d="M20 50 C20 22 32 16 50 16 C68 16 80 22 80 50 C80 72 74 80 50 82 C26 80 20 72 20 50Z"
            fill="#1E293B"
        />
        {/* Inner Face Coin */}
        <Circle cx="50" cy="48" r="22" fill="#FBBF24" />
        {/* Sunglasses */}
        <Rect x="34" y="42" width="14" height="10" rx="2" fill="#0F172A" />
        <Rect x="52" y="42" width="14" height="10" rx="2" fill="#0F172A" />
        <Path d="M48 45 H52" stroke="#0F172A" strokeWidth="2" />
    </Svg>
);

// Stage 5: Whale (Legend)
export const Stage5Whale = ({ size = 120 }: SpriteProps) => (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        {/* Aura glow */}
        <Circle cx="50" cy="50" r="42" fill="#35D7FF" opacity="0.12" />
        {/* Whale body */}
        <Path
            d="M18 52 C18 36 32 26 50 26 C68 26 82 36 82 52 C82 66 70 76 52 76 L52 84 C52 84 42 78 38 72 C26 68 18 62 18 52Z"
            fill="#35D7FF"
        />
        {/* Belly */}
        <Path
            d="M28 54 C28 46 38 40 50 40 C62 40 72 46 72 54 C72 62 64 68 50 68 C36 68 28 62 28 54Z"
            fill="#0E4A6E"
        />
        {/* Eye */}
        <Circle cx="40" cy="48" r="4" fill="#FFFFFF" />
        <Circle cx="40" cy="48" r="2" fill="#0F172A" />
        {/* Smile */}
        <Path d="M36 58 Q42 64 50 60" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        {/* Fin */}
        <Path d="M62 52 L74 46 L72 58 Z" fill="#0E4A6E" />
    </Svg>
);
