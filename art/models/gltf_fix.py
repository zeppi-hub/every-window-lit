# Small in-place edits to GLB files that the glTF tools do not offer
# (used by compress.sh):
#   python3 -I art/models/gltf_fix.py untexture <file.glb> <material name part>
#     drops every texture from the materials whose name contains the part
#     (the app draws its own glass, so the lantern's glass texture is never seen);
#   python3 -I art/models/gltf_fix.py declare-quantization <file.glb>...
#     declares KHR_mesh_quantization, which gltf-transform leaves out when
#     only normals and UVs are quantized (the validator then rejects the file).
import json
import struct
import sys

TEXTURES = ('normalTexture', 'occlusionTexture', 'emissiveTexture')
PBR_TEXTURES = ('baseColorTexture', 'metallicRoughnessTexture')


def edit(path, change):
    data = open(path, 'rb').read()
    length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + length])
    rest = data[20 + length:]
    change(gltf)
    text = json.dumps(gltf, separators=(',', ':')).encode()
    text += b' ' * ((4 - len(text) % 4) % 4)
    out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(text) + len(rest)) + struct.pack('<I', len(text)) + b'JSON' + text + rest
    open(path, 'wb').write(out)


def untexture(part):
    def change(gltf):
        for material in gltf.get('materials', []):
            if part.lower() not in material.get('name', '').lower():
                continue
            for key in TEXTURES:
                material.pop(key, None)
            for key in PBR_TEXTURES:
                material.get('pbrMetallicRoughness', {}).pop(key, None)
            print(f"  {material['name']}: textures dropped")
    return change


def declare_quantization(gltf):
    for key in ('extensionsUsed', 'extensionsRequired'):
        gltf[key] = sorted(set(gltf.get(key, [])) | {'KHR_mesh_quantization'})


if __name__ == '__main__':
    command = sys.argv[1]
    if command == 'untexture':
        edit(sys.argv[2], untexture(sys.argv[3]))
    elif command == 'declare-quantization':
        for path in sys.argv[2:]:
            edit(path, declare_quantization)
    else:
        sys.exit(f'unknown command {command}')
