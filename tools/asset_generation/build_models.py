"""Generate six original low-poly, shelf-scale Dungeon Shop Master GLB stock props.
Coordinate convention: glTF Y-up, +X faces the customer; model origin sits on the shelf surface.
Run: python build_models.py
"""
from pathlib import Path
import numpy as np
import trimesh
from scipy.spatial.transform import Rotation

OUT=Path(__file__).parent.parent.parent/'public'/'assets'/'models'
OUT.mkdir(parents=True,exist_ok=True)
S={}

def add(name, mesh, col, loc=(0,0,0), rotate=None):
    if rotate is not None: mesh.apply_transform(rotate)
    mesh.apply_translation(loc)
    rgba=np.array(col, dtype=np.uint8)
    if len(rgba)==3: rgba=np.r_[rgba,255]
    mesh.visual.vertex_colors=np.tile(rgba,(len(mesh.vertices),1))
    S[name].append(mesh)
    return mesh

def box(name, ext, col, loc=(0,0,0), rot=None):
    return add(name,trimesh.creation.box(extents=ext),col,loc,rot)

def ell(name, xyz, col, loc=(0,0,0), sub=1, rot=None):
    m=trimesh.creation.icosphere(subdivisions=sub, radius=1)
    m.apply_scale(xyz)
    return add(name,m,col,loc,rot)

def cyl(name,rad,height,col,loc=(0,0,0),sections=8,axis=(0,1,0)):
    m=trimesh.creation.cylinder(rad,height,sections=sections)
    T=trimesh.geometry.align_vectors([0,0,1],axis)
    return add(name,m,col,loc,T)

def rod_between(name,a,b,r,col,sections=6):
    a=np.array(a);b=np.array(b);direction=b-a
    return cyl(name,r,np.linalg.norm(direction),col,(a+b)/2,sections, direction/np.linalg.norm(direction))

def curved_leaf(name, start, end, width, col):
    a=np.asarray(start,float);b=np.asarray(end,float);middle=(a+b)/2
    axis=b-a;axis/=np.linalg.norm(axis)
    across=np.cross(axis,[1,0,0]);across/=np.linalg.norm(across)
    thick=np.array([1,0,0])*0.012
    v=np.array([a, middle+across*width, b, middle-across*width,
                middle+thick, middle-thick])
    faces=np.array([[0,1,4],[1,2,4],[2,3,4],[3,0,4],
                    [1,0,5],[2,1,5],[3,2,5],[0,3,5]])
    return add(name,trimesh.Trimesh(vertices=v,faces=faces,process=False),col)

def save(name):
    scene=trimesh.Scene()
    for k,m in enumerate(S[name]):
        scene.add_geometry(m,node_name=f'{name}-{k:02d}')
    out=OUT/f'{name}.glb'
    out.write_bytes(scene.export(file_type='glb'))
    bounds=scene.bounds
    print(f'{out.name:20} {out.stat().st_size:7,d} B  bounds={np.round(bounds,3).tolist()} parts={len(S[name])}')

n='healing-herb';S[n]=[]
leaves=[(-.085,.235,-.055),(-.01,.30,-.075),(.07,.27,-.045),(.02,.31,.06),
        (-.06,.24,.080),(.055,.21,.10),(-.07,.30,.012),(.04,.245,-.11)]
for i,(x,y,z) in enumerate(leaves):
    base=(0.006*(i%3-1),.025,.008*(i%4-1))
    tip=(x,y,z)
    rod_between(n,base,(x*.72,y*.7,z*.72),.009,[79,94,42])
    curved_leaf(n,(x*.35,y*.42,z*.35),tip,.027 if i%2 else .036,
                [88+i%3*10,132+i%4*5,57+i%2*9])
for h in [0.048,0.066,0.081]:
    cyl(n,.029,.014,[172,128,76],(0,h,0),sections=8)
rod_between(n,(-.03,.068,0),(.065,.042,.04),.011,[190,143,82])
save(n)

n='mana-potion';S[n]=[]
cyl(n,.100,.185,[39,111,192],(0,.120,0),sections=10)
cyl(n,.105,.025,[95,164,209],(0,.033,0),sections=10)
cyl(n,.074,.090,[85,151,187],(0,.237,0),sections=10)
cyl(n,.079,.020,[180,199,186],(0,.285,0),sections=10)
cyl(n,.060,.064,[145,102,65],(0,.319,0),sections=9)
ell(n,(.072,.016,.072),[177,119,71],(0,.352,0),sub=1)
for x,z in [(.045,.025),(-.035,-.025)]:
    ell(n,(.010,.014,.010),[43,202,251],(x,.116,z),sub=1)
save(n)

n='iron-ore';S[n]=[]
for i,(pos,scale) in enumerate([
    ((-.035,.095,-.025),(.103,.09,.083)), ((.065,.065,.03),(.085,.057,.078)),
    ((.01,.043,-.07),(.071,.04,.065)), ((-.055,.041,.058),(.055,.037,.066))]):
    r=Rotation.from_euler('xyz',[9+i*23,11+i*17,28+i*13],degrees=True).as_matrix()
    T=np.eye(4);T[:3,:3]=r
    ell(n,scale,[[94,93,91],[115,108,96],[78,82,84],[134,108,83]][i],pos,sub=0,rot=T)
save(n)

# The retail display name is Waybread, but the canonical ItemId is "bread".
# Asset filenames intentionally match ItemId for future glTF integration.
n='bread';S[n]=[]
ell(n,(.166,.085,.125),[169,100,50],(0,.09,0),sub=2)
ell(n,(.145,.046,.102),[205,133,66],(0,.147,0),sub=1)
for z in [-.065,0,.065]:
    box(n,(.020,.006,.17),[112,68,40],(.017,.186,z),None)
save(n)

n='iron-sword';S[n]=[]
box(n,(.228,.024,.066),[158,161,155],(.025,.042,0))
m=trimesh.creation.cone(radius=.044,height=.092,sections=4)
T=trimesh.geometry.align_vectors([0,0,1],[1,0,0]);m.apply_transform(T)
add(n,m,[191,185,171],(.185,.042,0))
box(n,(.022,.032,.165),[116,110,101],(-.102,.045,0))
box(n,(.113,.040,.036),[106,70,46],(-.171,.045,0))
ell(n,(.021,.023,.027),[138,127,110],(-.236,.045,0),sub=1)
save(n)

n='leather-vest';S[n]=[]
box(n,(.060,.201,.193),[122,76,44],(0,.143,0))
box(n,(.066,.065,.065),[146,92,53],(0,.261,-.080))
box(n,(.066,.065,.065),[146,92,53],(0,.261,.080))
box(n,(.010,.193,.035),[79,52,37],(.033,.150,0))
box(n,(.013,.037,.220),[87,51,31],(.043,.101,0))
box(n,(.017,.047,.042),[192,145,75],(.053,.102,0))
for y in [.152,.191,.23]:
    rod_between(n,(.046,y,-.035),(.056,y+.023,.035),.005,[205,154,94])
    rod_between(n,(.046,y,.035),(.056,y+.023,-.035),.005,[205,154,94])
save(n)
