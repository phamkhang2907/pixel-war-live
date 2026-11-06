using System;
using System.Collections.Generic;
using UnityEngine;

namespace PixelWar
{
    public enum Team { Red, Blue }
    public enum UnitKind { SmallSoldier, HeavySoldier, Archer, Mage, Giant }

    [Serializable] public class UnitStats
    {
        public float hp, speed, damage, range, cooldown, scale;
        public static UnitStats For(UnitKind kind)
        {
            switch(kind)
            {
                case UnitKind.HeavySoldier: return new UnitStats { hp=175, speed=2.2f, damage=18, range=1.5f, cooldown=1.3f, scale=1.3f };
                case UnitKind.Archer: return new UnitStats { hp=65, speed=2.9f, damage=12, range=9, cooldown=1.5f, scale=1 };
                case UnitKind.Mage: return new UnitStats { hp=55, speed=2.7f, damage=22, range=8, cooldown=2.2f, scale=1 };
                case UnitKind.Giant: return new UnitStats { hp=800, speed=1.5f, damage=65, range=2.5f, cooldown=2.5f, scale=2.8f };
                default: return new UnitStats { hp=95, speed=3.8f, damage=10, range=1.3f, cooldown=0.9f, scale=0.9f };
            }
        }
    }

    public class PixelWarGame : MonoBehaviour
    {
        public static PixelWarGame Instance { get; private set; }
        public readonly List<BattleUnit> units = new List<BattleUnit>();
        public Castle redCastle, blueCastle;
        public bool battleRunning = true;
        public int round = 1;
        public int redKills, blueKills;
        public event Action<string> OnAnnouncement;
        void Awake() { Instance = this; }
        void Update()
        {
            if (!battleRunning) return;
            if (redCastle && redCastle.hp <= 0) EndRound(Team.Blue);
            else if (blueCastle && blueCastle.hp <= 0) EndRound(Team.Red);
        }
        public void Spawn(Team team, UnitKind kind, int count, string sender="Demo")
        {
            count = Mathf.Clamp(count, 1, 250);
            float x = team == Team.Red ? -25 : 25;
            for (int i=0; i<count; i++)
            {
                var go = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                go.name = team + " " + kind + " " + sender;
                go.transform.position = new Vector3(x + UnityEngine.Random.Range(-2f,2f), 0.8f, UnityEngine.Random.Range(-15f,15f));
                var unit = go.AddComponent<BattleUnit>();
                unit.Initialize(team,kind,sender);
                units.Add(unit);
            }
            OnAnnouncement?.Invoke(sender + " summoned " + count + " " + kind + " for " + team);
        }
        public void EndRound(Team winner)
        {
            battleRunning=false;
            OnAnnouncement?.Invoke(winner + " WINS ROUND " + round);
            Invoke(nameof(RestartRound), 7f);
        }
        public void RestartRound()
        {
            foreach(var unit in units) if(unit) Destroy(unit.gameObject);
            units.Clear();
            redCastle.hp=redCastle.maxHp; blueCastle.hp=blueCastle.maxHp;
            redKills=0; blueKills=0; round++; battleRunning=true;
        }
        public void SetRunning(bool value) { battleRunning=value; }
        void OnGUI()
        {
            GUI.Box(new Rect(12,12,330,170), "PIXEL WAR 3D | ROUND " + round);
            GUI.Label(new Rect(25,40,310,24), "RED HP " + (redCastle ? Mathf.Max(0,redCastle.hp).ToString("0") : "-") + "   BLUE HP " + (blueCastle ? Mathf.Max(0,blueCastle.hp).ToString("0") : "-"));
            GUI.Label(new Rect(25,65,310,24), "Units: " + units.Count + "   Kills: " + redKills + " / " + blueKills);
            if(GUI.Button(new Rect(25,95,100,30), battleRunning ? "Pause" : "Resume")) battleRunning=!battleRunning;
            if(GUI.Button(new Rect(130,95,95,30), "RED +10")) Spawn(Team.Red,UnitKind.SmallSoldier,10);
            if(GUI.Button(new Rect(230,95,95,30), "BLUE +10")) Spawn(Team.Blue,UnitKind.SmallSoldier,10);
            if(GUI.Button(new Rect(25,130,145,28), "RED Giant")) Spawn(Team.Red,UnitKind.Giant,1);
            if(GUI.Button(new Rect(180,130,145,28), "BLUE Mage x5")) Spawn(Team.Blue,UnitKind.Mage,5);
        }
    }

    public class Castle : MonoBehaviour
    {
        public Team team;
        public float maxHp=10000, hp=10000;
        public void TakeDamage(float amount) { hp=Mathf.Max(0,hp-amount); }
    }

    public class BattleUnit : MonoBehaviour
    {
        public Team team;
        public UnitKind kind;
        public string sender;
        public UnitStats stats;
        public float hp;
        float nextAttack, nextScan;
        BattleUnit target;
        Castle targetCastle;
        Renderer visual;
        public void Initialize(Team side, UnitKind type, string owner)
        {
            team=side; kind=type; sender=owner; stats=UnitStats.For(kind); hp=stats.hp;
            transform.localScale=Vector3.one * stats.scale;
            visual=GetComponent<Renderer>();
            visual.material.color=team==Team.Red ? new Color(0.92f,0.18f,0.16f) : new Color(0.15f,0.4f,1f);
        }
        void Update()
        {
            var game=PixelWarGame.Instance;
            if (!game || !game.battleRunning) return;
            if(Time.time>nextScan || !target || target.hp<=0)
            {
                nextScan=Time.time+0.4f+UnityEngine.Random.Range(0f,0.2f);
                target=null;
                float best=12f*12f;
                foreach(var candidate in game.units)
                {
                    if(!candidate || candidate.team==team || candidate.hp<=0) continue;
                    float d=(candidate.transform.position-transform.position).sqrMagnitude;
                    if(d<best) {best=d;target=candidate;}
                }
                targetCastle=team==Team.Red ? game.blueCastle : game.redCastle;
            }
            Vector3 destination=target ? target.transform.position : targetCastle.transform.position;
            Vector3 offset=destination-transform.position; offset.y=0;
            float range=target ? stats.range : Mathf.Max(stats.range,4f);
            if(offset.sqrMagnitude>range*range)
            {
                transform.position += offset.normalized*stats.speed*Time.deltaTime;
                if(offset.sqrMagnitude>0.01f) transform.rotation=Quaternion.Slerp(transform.rotation,Quaternion.LookRotation(offset),Time.deltaTime*7f);
            }
            else if(Time.time>=nextAttack)
            {
                nextAttack=Time.time+stats.cooldown;
                if(target) target.TakeDamage(stats.damage,team);
                else if(targetCastle) targetCastle.TakeDamage(stats.damage);
            }
        }
        public void TakeDamage(float amount, Team attacker)
        {
            hp-=amount;
            if(hp>0) return;
            var game=PixelWarGame.Instance;
            if(game) {game.units.Remove(this); if(attacker==Team.Red) game.redKills++; else game.blueKills++;}
            Destroy(gameObject);
        }
    }
}