// TEMPORARY — App Store / Play screenshot + preview data.
//
// When DEMO_MODE is true, a handful of fetch functions short-circuit to the hardcoded
// data in ./demoData instead of hitting Supabase, so the sim screens look populated for
// marketing captures. Everything demo-related is gated by this one flag and lives in
// src/demo/ — to remove it after shooting: set DEMO_MODE = false (or delete src/demo/ and
// the `if (DEMO_MODE) …` lines that import from it).
//
// Camera screens (lens, recorder, Studio capture) are NOT covered — the sim has no camera;
// capture those on a real device.
export const DEMO_MODE = false;
