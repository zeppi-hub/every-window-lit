import { AssetManager, BackSide, Color, type Entity, FogExp2, Mesh, MeshBasicMaterial, type Object3D, SphereGeometry, Vector3, type World } from '@iwsdk/core';

/**
 * The places of the new version, each one GLB from art/v2 (Draco + KTX2,
 * which IWSDK's loader reads): the 2008 neighbourhood, and the memories'
 * worlds. One shown at a time, with its own sky colour and fog; the city is
 * loaded before the way in opens, the memories in the background after.
 */
export type Place = 'city' | 'circus' | 'forest';

const FILES: Readonly<Record<Place, string>> = {
  city: 'v2/mahalle/mahalle.glb',
  circus: 'v2/sirk/sirk.glb',
  forest: 'v2/yangin/yangin.glb',
};

/** The weather of a moment: sky colour, fog colour and density, and how strong the sky's light is. */
export interface Weather {
  sky: number;
  fog: number;
  density: number;
  light: number;
}

export const WEATHER = {
  rain2008: { sky: 0x8d969f, fog: 0xa9b2bb, density: 0.016, light: 0.75 },
  noon2008: { sky: 0xbcd3e6, fog: 0xc9d6e0, density: 0.006, light: 1.15 },
  evening2041: { sky: 0xc79a7a, fog: 0xb89a88, density: 0.01, light: 0.8 },
  circus: { sky: 0x1a1210, fog: 0x2a1c16, density: 0.01, light: 1.1 },
  forest: { sky: 0x6e5a4a, fog: 0x8a7a6a, density: 0.022, light: 0.9 },
} as const satisfies Record<string, Weather>;

export class Stage {
  private readonly roots: Partial<Record<Place, Object3D>> = {};
  private readonly entities: Partial<Record<Place, Entity>> = {};
  /** Things of a place made by the game (a lamp, a sign, the broadcast screen), hidden with it and shown as they were when it comes back. */
  private readonly owned: Record<Place, { object: Object3D; was: boolean }[]> = { city: [], circus: [], forest: [] };
  private readonly loading: Partial<Record<Place, Promise<Object3D>>> = {};
  private readonly skyDome: Mesh;
  private readonly world: World;
  shown: Place | null = null;

  constructor(world: World) {
    this.world = world;
    // A plain sky round everything (the scenes carry their own skyline in the fog).
    this.skyDome = new Mesh(new SphereGeometry(900, 24, 12), new MeshBasicMaterial({ color: 0x8d969f, side: BackSide, depthWrite: false, fog: false }));
    this.skyDome.name = 'V2Sky';
    this.skyDome.renderOrder = -1;
    this.skyDome.pointerEvents = 'none';
    world.createTransformEntity(this.skyDome, { persistent: true });
    world.scene.fog = new FogExp2(0xa9b2bb, 0.016);
  }

  load(place: Place): Promise<Object3D> {
    const known = this.loading[place];
    if (known != null) return known;
    const promise = AssetManager.loadGLTF(FILES[place], `v2_${place}`).then((gltf) => {
      const root = gltf.scene;
      root.name = `V2_${place}`;
      root.visible = false;
      root.traverse((o) => {
        o.pointerEvents = 'none';
        // The big merged meshes get a bounds tree, so rays into them (window spots) are quick.
        const geometry = (o as Mesh).geometry as { computeBoundsTree?: () => void } | undefined;
        if ((o as Mesh).isMesh === true && geometry?.computeBoundsTree != null) geometry.computeBoundsTree();
      });
      this.entities[place] = this.world.createTransformEntity(root, { persistent: true });
      this.roots[place] = root;
      if (import.meta.env.DEV) console.info(`[stage] ${place} loaded`);
      return root;
    });
    this.loading[place] = promise;
    return promise;
  }

  root(place: Place): Object3D | null {
    return this.roots[place] ?? null;
  }

  entity(place: Place): Entity | null {
    return this.entities[place] ?? null;
  }

  /** The game's own things that belong to `place`: hidden while another place is shown. */
  own(place: Place, ...objects: Object3D[]): void {
    for (const object of objects) this.owned[place].push({ object, was: object.visible });
    if (this.shown != null && this.shown !== place) for (const object of objects) object.visible = false;
  }

  /** A named node or point of a place (world position into `out`). */
  point(place: Place, name: string, out: Vector3): Vector3 {
    const node = this.roots[place]?.getObjectByName(name);
    if (node == null) {
      if (import.meta.env.DEV) console.warn(`[stage] no ${name} in ${place}`);
      return out.set(0, 0, 0);
    }
    return node.getWorldPosition(out);
  }

  node(place: Place, name: string): Object3D | null {
    return this.roots[place]?.getObjectByName(name) ?? null;
  }

  async show(place: Place, weather: Weather): Promise<void> {
    const root = await this.load(place);
    if (this.shown !== place) {
      if (this.shown != null)
        for (const o of this.owned[this.shown]) {
          o.was = o.object.visible;
          o.object.visible = false;
        }
      for (const o of this.owned[place]) o.object.visible = o.was;
    }
    for (const [name, other] of Object.entries(this.roots)) if (other != null) other.visible = name === place;
    root.visible = true;
    this.shown = place;
    this.setWeather(weather);
  }

  setWeather(weather: Weather): void {
    (this.skyDome.material as MeshBasicMaterial).color.setHex(weather.sky);
    const fog = this.world.scene.fog as FogExp2;
    fog.color.setHex(weather.fog);
    fog.density = weather.density;
    this.world.scene.background = new Color(weather.sky);
    this.world.scene.environmentIntensity = weather.light;
  }

  /** Blend between two weathers (0..1), for the time-lapse. */
  blendWeather(a: Weather, b: Weather, k: number): void {
    const mix = (x: number, y: number) => new Color(x).lerp(new Color(y), k).getHex();
    this.setWeather({ sky: mix(a.sky, b.sky), fog: mix(a.fog, b.fog), density: a.density + (b.density - a.density) * k, light: a.light + (b.light - a.light) * k });
  }
}
