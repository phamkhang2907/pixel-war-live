using UnityEngine;
namespace PixelWar
{
    public class OrbitCamera : MonoBehaviour
    {
        public Vector3 focus=Vector3.zero;
        public float distance=68, yaw=0, pitch=55;
        void LateUpdate()
        {
            if(Input.GetMouseButton(1)) {yaw+=Input.GetAxis("Mouse X")*4;pitch=Mathf.Clamp(pitch-Input.GetAxis("Mouse Y")*4,15,85);}
            if(Input.GetMouseButton(2)) {focus-=transform.right*Input.GetAxis("Mouse X")*2;focus-=Vector3.ProjectOnPlane(transform.up,Vector3.up).normalized*Input.GetAxis("Mouse Y")*2;}
            distance=Mathf.Clamp(distance-Input.mouseScrollDelta.y*4,18,125);
            var rotation=Quaternion.Euler(pitch,yaw,0);
            transform.position=focus+rotation*new Vector3(0,0,-distance);
            transform.rotation=rotation;
        }
    }
}