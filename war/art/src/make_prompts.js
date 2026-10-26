// Codex 프롬프트 만들기: node make_prompts.js → prompt_*.txt
const fs = require('fs');
const path = require('path');
const dir = __dirname;

const HEAD = out => `Use your built-in image generation tool to create ONE image and save it as PNG to: ${out}.png (in the current working directory). Do not write code to draw it; it must be a generated illustration. After saving, reply only with the file name. Do NOT edit, clean or post-process the image with code or scripts: save the generated image as-is.

ART STYLE (most important): EXACTLY the art style of the attached reference images from our mobile game: soft flat 2D vector illustration, simple clean shapes, flat fills with one soft shadow tone and one subtle highlight tone, hard clean edges, NO black outlines, NO line art, NO gradients, NO texture noise, NO glow, NO anime style, NO motion lines, NO text, NO letters, NO numbers, NO logos, NO real-world political symbols or insignia (no swastikas, no real flags). Mood: grim World War 2 war story, muted desaturated dusty military colors (olive drab, khaki, field grey, mud brown).
`;
const MAGENTA = `Background: solid flat MAGENTA (#FF00FF) everywhere behind the drawings: no floor, no ground shadow, no vignette, no frame, no grid lines. The drawings themselves must not contain magenta or purple. Pink mouse ears, nose, hands and tail are fine.
`;

const RAT = `a WW2 infantry soldier who is an anthropomorphic RAT in the manner of Art Spiegelman's MAUS: a fully HUMAN-proportioned adult body (about 7 heads tall, long legs, human hands but pink), with the realistic brown rat HEAD from the attached reference (long pointed snout, pink nose, small black eye, round pink ears, white whiskers, brown fur). Uniform: olive drab wool field jacket with pockets, khaki trousers tucked into brown leather boots, brown webbing belt with ammo pouches and a canteen, a small backpack, a round olive steel helmet with chin strap sitting on the head between the ears (ears stick out). Long thin pink tail hanging out behind. Weapon: a brown wooden bolt-action rifle with a dark metal barrel.`;
const CAT = `a WW2 enemy infantry soldier of the tyrant cat army: an anthropomorphic CAT with a fully HUMAN-proportioned adult body (about 7 heads tall, long legs), with a realistic flat grey cat HEAD like the grey cat in the attached reference (pointy ears, green eyes, white whiskers, grey fur). Uniform (fictional, no real insignia): long field-grey greatcoat with a dark belt and black ammo pouches, black jackboots, a dark grey steel helmet with a flared rim (ears poke out through slits), a blood-red armband with a plain black circle (nothing inside the circle). Grey tail hanging out behind under the coat. Grim cold expression. Weapon: a black submachine gun with a long straight magazine.`;

const P = {};
for (const [s, D] of [['rat', RAT], ['cat', CAT]]) {
  P[`${s}_body`] = MAGENTA + `
Image spec:
- 1536x1024 landscape. An exact grid of 3 columns x 1 row (each cell 512x1024). In each cell the SAME character, centered, standing on the same invisible ground line about 30 px above the bottom, filling about 88% of the cell height, fully inside the cell with a clear magenta margin, not touching cell borders.
- CHARACTER: ${D}
- POSE (it will be cut into rig parts for 2D cutout animation): calm neutral standing rig pose, legs straight and slightly apart, feet flat.
- Cell 1 (left): FRONT VIEW facing the viewer. The weapon is held diagonally across the chest with both hands (port arms), muzzle up to the viewer's right. Tail visible hanging down beside one leg.
- Cell 2 (middle): pure SIDE VIEW, profile FACING RIGHT. Only the near arm is clearly visible; both hands hold the weapon horizontally at waist height pointing forward to the RIGHT (ready to advance), the near arm bent with a clear gap of background between the arm and the torso. One leg slightly forward. The tail hangs out behind to the LEFT, separated from the legs.
- Cell 3 (right): BACK VIEW seen from behind (the back of the helmet, the back of the head and ears, the backpack, the tail hanging down from the middle); the weapon is held in front so only its muzzle sticks out above one shoulder.`;

  P[`${s}_poses`] = MAGENTA + `
Image spec:
- 1536x1024 landscape. An exact grid of 3 columns x 2 rows (each cell 512x512). One drawing per cell with a clear magenta margin; drawings must NOT touch or cross cell borders. In every cell the character rests on the SAME invisible ground line about 30 px above the bottom of the cell. Draw EXACTLY the same character as the attached character sheet (same design, colors, proportions, flat style), the same scale in every cell (crouching poses fill most of the cell height).
- CHARACTER: ${D}
Cells, left to right, top to bottom:
1. TAKING COVER, SIDE VIEW facing RIGHT: crouched low on one knee, back bent, helmet low, the weapon held close and pointing up, as if hiding behind a low wall (do NOT draw the wall).
2. TAKING COVER, FRONT VIEW facing the viewer: crouched low on one knee, weapon held upright, head ducked.
3. TAKING COVER, BACK VIEW seen from behind: crouched low on one knee, we see the back and the helmet, tail on the ground.
4. KNEELING AIM, SIDE VIEW facing RIGHT: kneeling on one knee, the weapon shouldered and aimed straight to the RIGHT, eye at the sights (firing over cover).
5. THROWING a grenade, SIDE VIEW facing RIGHT: standing, one arm swung back high over the head holding a small round grenade, other arm forward, weapon slung on the back.
6. OPERATING A MORTAR, SIDE VIEW facing RIGHT: crouched, both hands dropping a mortar shell into the mouth of a short mortar tube on a bipod in front of him (draw the mortar tube).`;

  P[`${s}_death`] = MAGENTA + `
Image spec:
- 1536x1024 landscape. An exact grid of 2 columns x 2 rows (each cell 768x512). One drawing per cell with a clear magenta margin; drawings must NOT touch or cross cell borders. In every cell the character rests on the SAME invisible ground line about 40 px above the bottom of the cell. Draw EXACTLY the same character as the attached character sheet (same design, colors, proportions, flat style), at the same scale in every cell.
- CHARACTER: ${D}
- A 4-frame grim WAR DEATH animation, PURE SIDE VIEW, the soldier FACES RIGHT, is shot from the right and falls BACKWARD to the LEFT. Blood is allowed but drawn only as a FEW FLAT DARK-RED SHAPES (no splatter noise).
Frames, left to right, top to bottom:
1. SHOT: the body jerks back, hit in the chest, a flat dark-red blood spurt from the chest, the weapon slipping from the hands, helmet tilting.
2. STAGGER: knees buckling, falling backward, arms loose, the weapon falling, the helmet coming off.
3. FALL: hitting the ground on the back, body almost horizontal, one arm flung out.
4. DEAD: lying still flat on the back, head on the LEFT, feet to the RIGHT, eyes closed, a flat dark-red blood pool under the body, the weapon and the helmet lying on the ground beside.`;
}

P.weapons = MAGENTA + `
Image spec:
- 1536x1024 landscape. An exact grid of 3 columns x 2 rows (each cell 512x512). One object per cell, centered, HORIZONTAL, muzzle pointing to the RIGHT, pure SIDE VIEW, filling about 85% of the cell width, with a clear magenta margin, not touching cell borders. Objects only, no hands, no people.
Cells, left to right, top to bottom:
1. a WW2 bolt-action RIFLE: brown wood stock, dark metal barrel and bolt.
2. a WW2 light MACHINE GUN: dark metal, wooden butt, folded bipod under the barrel, top-mounted curved magazine.
3. a WW2 SNIPER RIFLE: long brown wood stock, long barrel, a long black telescopic scope on top.
4. a WW2 SUBMACHINE GUN: black metal, short, long straight magazine underneath.
5. a short double-barrel SHOTGUN with a brown wooden stock.
6. a round olive hand GRENADE and, beside it, a dark stick grenade.`;

P.props = MAGENTA + `
Image spec:
- 1536x1536 square. An exact grid of 3 columns x 3 rows (each cell 512x512). One object per cell, standing on an invisible ground line about 30 px above the bottom of the cell, seen from a slightly high FRONT 3/4 view like the game DON'T STARVE (flat paper-cutout look: we see the front face and a little of the top), with a clear magenta margin, not touching cell borders.
Cells, left to right, top to bottom:
1. a LOW wall of stacked khaki SANDBAGS, wide (fills the cell width), waist-high.
2. a HIGH ruined RED-BRICK WALL section with a broken jagged top and a few missing bricks, wide, taller than a man.
3. a dead, burnt, leafless war-torn TREE with a broken trunk (tall, thin).
4. a stack of two wooden military supply CRATES (low cover).
5. a coil of BARBED WIRE on wooden X-shaped stakes.
6. a WW2 MORTAR emplacement: a short dark-olive mortar tube on a bipod and base plate, with a small open crate of shells beside it.
7. a WW2 heavy MACHINE GUN nest: a dark heavy machine gun on a tripod behind a short curved wall of sandbags.
8. a wrecked burnt-out small military truck seen from the side (tall).
9. a broken grey stone farmhouse WALL corner with an empty window hole (tall).`;

P.terrain = `
Image spec:
- 1536x1024 landscape. An exact grid of 3 columns x 2 rows (each cell 512x512). No magenta anywhere. Each of the first five cells is a SQUARE SEAMLESS TILE texture seen from directly ABOVE (top-down), filling the cell edge to edge, simple flat shapes in the flat vector style, muted grim colors, low contrast so units stay readable on top:
1. muddy dead grass field (olive and brown patches).
2. bare churned brown mud with a few small puddles.
3. a plain dirt ground, dusty light brown.
4. trodden dry grass, lighter olive.
5. dark wet mud with scattered small stones and debris.
6. (side view, filling the whole cell) the vertical FACE of a raised earth embankment: packed dark earth with layered horizontal bands, a few roots and stones, a thin grass lip along the top edge.`;

for (const [k, v] of Object.entries(P)) fs.writeFileSync(path.join(dir, `prompt_${k}.txt`), HEAD(k) + v + '\n');
console.log(Object.keys(P).join(' '));
