import * as THREE from "three";
// The colour values live in src/theme.ts (no three.js import, so 2D UI can use them too).
export { HEX, SECTION_COLORS } from "../theme";

export const col = (h: string) => new THREE.Color(h);
