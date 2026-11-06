using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using PixelWar;
public static class PixelWarSceneBuilder
{
    [MenuItem("PIXEL WAR/Create Playable Demo Scene")]
    public static void CreateScene()
    {
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        var game=new GameObject("PixelWarGame").AddComponent<PixelWarGame>();
        var ground=GameObject.CreatePrimitive(PrimitiveType.Plane);
        ground.name="Battlefield"; ground.transform.localScale=new Vector3(8,1,5);
        ground.GetComponent<Renderer>().sharedMaterial=Mat(new Color(.18f,.34f,.17f));
        game.redCastle=MakeCastle("RED Castle",Team.Red,new Vector3(-33,3,0),new Color(.6f,.14f,.14f));
        game.blueCastle=MakeCastle("BLUE Castle",Team.Blue,new Vector3(33,3,0),new Color(.14f,.25f,.65f));
        var light=new GameObject("Sun").AddComponent<Light>(); light.type=LightType.Directional; light.intensity=1.6f; light.transform.rotation=Quaternion.Euler(45,-35,0);
        RenderSettings.ambientLight=new Color(.6f,.65f,.75f);
        var camera=new GameObject("Battle Camera").AddComponent<Camera>();camera.tag="MainCamera";camera.gameObject.AddComponent<AudioListener>();camera.gameObject.AddComponent<OrbitCamera>();
        EditorSceneManager.SaveScene(scene,"Assets/PixelWarDemo.unity");
        EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene("Assets/PixelWarDemo.unity",true)};
        Selection.activeGameObject=game.gameObject;
        Debug.Log("PIXEL WAR demo created. Press Play; click RED +10 / BLUE +10.");
    }
    static Material Mat(Color c) { var shader=Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"); var m=new Material(shader);m.color=c;return m; }
    static Castle MakeCastle(string name,Team team,Vector3 pos,Color color)
    {
        var obj=GameObject.CreatePrimitive(PrimitiveType.Cube);obj.name=name;obj.transform.position=pos;obj.transform.localScale=new Vector3(6,6,12);obj.GetComponent<Renderer>().sharedMaterial=Mat(color);
        var castle=obj.AddComponent<Castle>();castle.team=team;return castle;
    }
}