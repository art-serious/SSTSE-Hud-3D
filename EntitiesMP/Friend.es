2020
%{
#include "StdH.h"
#include "EntitiesMP/Player.h"
#include "EntitiesMP/PlayerWeapons.h"
#include "EntitiesMP/MusicHolder.h"
#include "EntitiesMP/EnemyBase.h"
#include "EntitiesMP/FriendManager.h"
#include "EntitiesMP/FriendMarker.h"

#include "Models/Weapons/SingleShotgun/SingleShotgunItem.h"
#include "Models/Weapons/SingleShotgun/Barrels.h"

#include "Models/Weapons/TommyGun/TommyGunItem.h"
#include "Models/Weapons/TommyGun/Body.h"

#include "ModelsMP/Weapons/Sniper/SniperItem.h"
#include "ModelsMP/Weapons/Sniper/Sniper.h"

#include "Models/Weapons/DoubleShotgun/DoubleShotgunItem.h"
#include "Models/Weapons/DoubleShotgun/Dshotgunbarrels.h"

#include "ModelsMP/Player/SeriousSam/Player.h"
#include "ModelsMP/Player/SeriousSam/Body.h"
#include "ModelsMP/Player/SeriousSam/Head.h"

#define MF_MOVEZ        (1L<<0)
#define MF_ROTATEH      (1L<<1)
#define MF_MOVEXZY      (1L<<2)
#define MF_MOVE_PLUS_Z  (1L<<3)

// bullet positions
static FLOAT afSingleShotgunPellets[] =
{     -0.3f,+0.1f,    +0.0f,+0.1f,   +0.3f,+0.1f,
  -0.4f,-0.1f,  -0.1f,-0.1f,  +0.1f,-0.1f,  +0.4f,-0.1f
};

static FLOAT afDoubleShotgunPellets[] =
{
      -0.3f,+0.15f, +0.0f,+0.15f, +0.3f,+0.15f,
  -0.4f,+0.05f, -0.1f,+0.05f, +0.1f,+0.05f, +0.4f,+0.05f,
      -0.3f,-0.05f, +0.0f,-0.05f, +0.3f,-0.05f,
  -0.4f,-0.15f, -0.1f,-0.15f, +0.1f,-0.15f, +0.4f,-0.15f
};

// info structure
static EntityInfo eiFriend = {
  EIBT_FLESH, 80.0f,
  0.0f, 2.0f, 0.0f,     // source (eyes)
  0.0f, 1.5f, 0.0f,     // target (body)
};

// model
#define ECF_MODEL_PASSING_VEHICLES ( \
  ((ECBI_MODEL|ECBI_BRUSH|ECBI_PROJECTILE_MAGIC|ECBI_PROJECTILE_SOLID|ECBI_ITEM|ECBI_MODEL_HOLDER|ECBI_CORPSE_SOLID)<<ECB_TEST) |\
  ((ECBI_MODEL)<<ECB_IS) |\
  ((ECBI_PROJECTILE_SOLID)<<ECB_PASS))

#define BF_MOVING                 (1UL<<0) // can run/walk
#define BF_SHOOTING               (1UL<<1) // can shoot enemies
#define BF_FOLLOW_PLAYER          (1UL<<2) // follow player
#define BF_ENTER_CAR              (1UL<<3) // can enter car
#define BF_LEAVE_CAR              (1UL<<4) // can leave car
#define BF_VEHICLE_SHOOTER        (1UL<<5) // can enter shooter position
%}

event EFriendChange {
  CEntityPointer penFriendManager,
};


class CFriend : CMovableModelEntity {
name      "Friend";
thumbnail "Thumbnails\\AdventureTech\\Friend.tex";
features "HasName", "HasDescription", "IsTargetable";

properties:

  1 CTString     m_strName                "Name" 'N' = "Friend",
  2 CTString     m_strDescription = "",
  3 CTFileName   m_fnAmc                  "AMC File" = CTFILENAME("ModelsMP\\CutSequences\\Santa\\Santa.amc"),
  4 FLOAT        m_fMaxHealth             "Health" = 100.0f,
  5 BOOL         m_bTemplate              "Template" = FALSE,
  6 INDEX        m_iCleanupIndex          "Cleanup Index" = -1,
  7 BOOL         m_bReceivePlayerDamage   "Receive Player Damage" = FALSE,
  8 CSoundObject m_soMouth,  
  9 flags VisibilityBits m_flBehaviourFlags "Behaviour Flags" = (BF_MOVING|BF_SHOOTING|BF_FOLLOW_PLAYER),
  10 FLOAT m_fEnemyStopDistance             "Enemy Stop Distance" = 10.0f,
  11 CEntityPointer m_penMarker "*Marker",

  12 FLOAT3D    m_vDesiredPosition = FLOAT3D(0),
  13 CEntityPointer m_penTarget,
  14 CEntityPointer m_penPlayer,
  15 FLOAT m_fMoveSpeed "Move Speed" = 9.5f,

  16 FLOAT m_fPlayerStopDistance                "Player Stop Distance" = 3.0f,

  17 CEntityPointer m_penMusicHolder,
  18 FLOAT m_fMoveFrequency "Tick Time" = 0.1f,
  19 ANGLE m_aDefaultBodyPitch = 0,

  //20 CEntityPointer m_penVehicle,

  21 FLOAT m_tmSpraySpawned = 0.0f,   // time when damage has been applied
  22 FLOAT m_fSprayDamage = 0.0f,     // total ammount of damage
  23 CEntityPointer m_penSpray,       // the blood spray
  24 FLOAT m_fMaxDamageAmmount  = 0.0f, // max ammount of damage received in in last few ticks
  25 FLOAT3D m_vLastStain  = FLOAT3D(0,0,0), // where last stain was left
  26 enum SprayParticlesType m_sptType = SPT_BLOOD, // type of particles

  27 INDEX m_iAvailableWeapons "Available Weapons" = 0,
  28 enum WeaponType m_iCurrentWeapon "Weapon" = WEAPON_NONE,

  29 CSoundObject m_soWeapon0,
  30 CSoundObject m_soWeapon1,

  31 FLOAT m_tmNextShootTime = -10.0f,
  32 FLOAT m_tmNextEvadeSend = -10.0f,

  33 BOOL m_bHideInMemory "Hide In Memory" = TRUE,
  34 BOOL m_bAlwaysCrouch "Always Crouch" = FALSE,

  35 FLOAT m_fDetectEnemyDistance "Detect Enemy Distance" = 90.0f,
  36 FLOAT m_tmLastSniperFire = -10.0f,
  37 FLOAT3D m_vBulletTarget = 0,
  38 FLOAT3D m_vBulletSource = 0,
  39 BOOL m_bHidden = FALSE,
  40 BOOL m_bHideFlare = FALSE,

  41 CEntityPointer m_penEnterVehicleTrigger "*Enter Vehicle Trigger",
  42 CEntityPointer m_penExitVehicleTrigger "*Exit Vehicle Trigger",
  43 CEntityPointer m_penEnterExitVehicle  "*Enter/Exit Specified Vehicle",

  44 FLOAT m_tmNextFindClosestEnemy = -10.0f,
  45 FLOAT m_tmNextSwitchTarget = -10.0f,

  46 CEntityPointer m_penDeathTarget "*Death Target",

  47 FLOAT m_cfStepHeight "Step Height" = -1.0f,
  48 FLOAT m_cfFallHeight "Fall Height" = -1.0f,

  49 CTString m_strIgnoreTarget1 "Ignore Target 1" = "",
  50 CTString m_strIgnoreTarget2 "Ignore Target 2" = "",
  51 CTString m_strIgnoreTarget3 "Ignore Target 3" = "",
  52 BOOL m_bCalculatedMarkerDestination = FALSE,
  53 FLOAT m_fWeaponRangeOverride "Weapon Range Override" = -1,
  54 FLOAT3D m_vMarkerDestination = FLOAT3D(0),
  55 CEntityPointer m_penMapMarker "*Map Marker",

  {
    CModelObject *pmoModel;

    CEntity *penBullet;
    CPlacement3D plBullet;
    FLOAT3D vBulletDestination;
  }
  

components:
  0 class   CLASS_BLOOD_SPRAY     "Classes\\BloodSpray.ecl",
  1 class   CLASS_BASIC_EFFECT    "Classes\\BasicEffect.ecl",
  2 class   CLASS_BULLET          "Classes\\Bullet.ecl",

// ************** FLARES **************
 10 model   MODEL_FLARE02               "Models\\Effects\\Weapons\\Flare02\\Flare.mdl",
 11 texture TEXTURE_FLARE02             "Models\\Effects\\Weapons\\Flare02\\Flare.tex",

// ************** TOMMYGUN **************
 20 model   MODEL_TOMMYGUN              "Models\\Weapons\\TommyGun\\TommyGunItem.mdl",
 21 model   MODEL_TG_BODY               "Models\\Weapons\\TommyGun\\Body.mdl",
 22 model   MODEL_TG_SLIDER             "Models\\Weapons\\TommyGun\\Slider.mdl",
 23 texture TEXTURE_TG_BODY             "Models\\Weapons\\TommyGun\\Body.tex",

 24 sound   SOUND_TOMMYGUN_FIRE         "Models\\Weapons\\TommyGun\\Sounds\\_Fire.wav",

 // sniper
 30 model   MODEL_SNIPER                "ModelsMP\\Weapons\\Sniper\\Sniper.mdl",
 31 model   MODEL_SNIPER_BODY           "ModelsMP\\Weapons\\Sniper\\Body.mdl",
 32 texture TEXTURE_SNIPER_BODY         "ModelsMP\\Weapons\\Sniper\\Body.tex",
 33 sound   SOUND_SNIPER_FIRE           "ModelsMP\\Weapons\\Sniper\\Sounds\\Fire.wav",

// ************** SINGLE SHOTGUN ************
 40 model   MODEL_SINGLESHOTGUN         "Models\\Weapons\\SingleShotgun\\SingleShotgunItem.mdl",
 41 model   MODEL_SS_SLIDER             "Models\\Weapons\\SingleShotgun\\Slider.mdl",
 42 model   MODEL_SS_HANDLE             "Models\\Weapons\\SingleShotgun\\Handle.mdl",
 43 model   MODEL_SS_BARRELS            "Models\\Weapons\\SingleShotgun\\Barrels.mdl",
 44 texture TEXTURE_SS_HANDLE           "Models\\Weapons\\SingleShotgun\\Handle.tex",
 45 texture TEXTURE_SS_BARRELS          "Models\\Weapons\\SingleShotgun\\Barrels.tex",
 46 sound   SOUND_SINGLESHOTGUN_FIRE    "Models\\Weapons\\SingleShotgun\\Sounds\\_Fire.wav",

 // DOUBLE SHOTGUN
 50 model   MODEL_DOUBLESHOTGUN         "Models\\Weapons\\DoubleShotgun\\DoubleShotgunItem.mdl",
 51 model   MODEL_DS_HANDLE             "Models\\Weapons\\DoubleShotgun\\Dshotgunhandle.mdl",
 52 model   MODEL_DS_BARRELS            "Models\\Weapons\\DoubleShotgun\\Dshotgunbarrels.mdl",
 54 model   MODEL_DS_SWITCH             "Models\\Weapons\\DoubleShotgun\\Switch.mdl",
 56 texture TEXTURE_DS_HANDLE           "Models\\Weapons\\DoubleShotgun\\Handle.tex",
 57 texture TEXTURE_DS_BARRELS          "Models\\Weapons\\DoubleShotgun\\Barrels.tex",
 58 texture TEXTURE_DS_SWITCH           "Models\\Weapons\\DoubleShotgun\\Switch.tex",
 59 sound   SOUND_DS_FIRE               "Models\\Weapons\\DoubleShotgun\\Sounds\\Fire.wav",
 60 sound   SOUND_DS_RELOAD             "Models\\Weapons\\DoubleShotgun\\Sounds\\Reload.wav",
functions:

  /* Entity info */
  void *GetEntityInfo(void) {
    return &eiFriend;
  };

  // render particles
  void RenderParticles(void)
  {
    if (m_tmLastSniperFire > _pTimer->GetLerpedCurrentTick()) {
      CAttachmentModelObject &amoBody = *GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO);
      FLOATmatrix3D m;
      MakeRotationMatrix(m, amoBody.amo_plRelative.pl_OrientationAngle);
      FLOAT3D vSource = m_vBulletSource + FLOAT3D(0.0f, 0.1f, -0.4f)*GetRotationMatrix()*m;
      Particles_SniperResidue(this, vSource , m_vBulletTarget);      
    }
    CMovableModelEntity::RenderParticles();
  }

  /* Check if entity is moved on a route set up by its targets. */
  BOOL MovesByTargetedRoute(CTString &strTargetProperty) const {
    strTargetProperty = "*Marker";
    return TRUE;
  };
  /* Check if entity can drop marker for making linked route. */
  BOOL DropsMarker(CTFileName &fnmMarkerClass, CTString &strTargetProperty) const {
    fnmMarkerClass = CTFILENAME("Classes\\HemingWW\\FriendMarker.ecl");
    strTargetProperty = "*Marker";
    return TRUE;
  }


  BOOL IsTargetValid(SLONG slPropertyOffset, CEntity *penTarget)
  {
    if( slPropertyOffset == offsetof(CFriend, m_penMarker))
    {
      return IsOfClass(penTarget, "Friend Marker") || IsOfClass(penTarget, "Marker");
    }

    return CEntity::IsTargetValid(slPropertyOffset, penTarget);
  }

  void ChangeFriend(CEntityPointer pen) {
    CFriendManager* penFriendManager = ((CFriendManager*)&*pen);
    switch (penFriendManager->m_enType) {
      case FCT_SET_MARKER:
        m_bCalculatedMarkerDestination = FALSE;
        m_penMarker = penFriendManager->m_penMarker;
      break;
      case FCT_SET_FLAGS:
        m_bCalculatedMarkerDestination = FALSE;
        m_flBehaviourFlags = penFriendManager->m_flBehaviourFlags;
        if ((m_flBehaviourFlags&BF_FOLLOW_PLAYER) == 0) {
          m_penPlayer = NULL;
        } else {
          m_penPlayer = FindClosestPlayer();
        }
        break;
      case FCT_SET_ENTER_VEHICLE_TRIGGER:
        m_bCalculatedMarkerDestination = FALSE;
        m_penEnterVehicleTrigger = penFriendManager->m_penEnterVehicleTrigger;
        break;
      case FCT_TELEPORT:
        m_bCalculatedMarkerDestination = FALSE;
        m_penMarker = penFriendManager->m_penMarker;
        if (m_penMarker != NULL) {
          Teleport(m_penMarker->GetPlacement(), FALSE);
        }
        ForceFullStop();
        break;
    }
  }

/*  CEntityPointer GetSpecifiedVehicle() {
    if (IsOfClass(m_penEnterExitVehicle, "VehicleSpawner")) {
      return ((CVehicleSpawner*)&*m_penEnterExitVehicle)->m_penSpawned; 
    }

    return m_penEnterExitVehicle;
  }

  void EnterVehicle(CEntityPointer penVehicle, BOOL bShooter) {

    EEnterVehicle eEnterVehicle;
    eEnterVehicle.bShooter = bShooter;
    eEnterVehicle.penPlayer = this;
    eEnterVehicle.penVehicle = penVehicle;
    penVehicle->SendEvent(eEnterVehicle);

    if (!bShooter) {
      SwitchToEditorModel();
      SetParent(penVehicle);
      SetCollisionFlags(ECF_IMMATERIAL);
    } else {
      SetCollisionFlags(ECF_MODEL_PASSING_VEHICLES);
    }

    Teleport(penVehicle->GetPlacement(), FALSE);

    StandingAnim(0);
    StopTranslating();
    StopRotating();
    m_penVehicle = penVehicle;

    if (m_penEnterExitVehicle == NULL || penVehicle == GetSpecifiedVehicle()) {
      SendToTarget(m_penEnterVehicleTrigger, EET_TRIGGER, this);
    }
  }

  void LeaveVehicle(CPlacement3D plLeavePosition, BOOL bKillPlayer, BOOL bSelfExit) {
    // if we're leaving not because some entity told us to leave
    if (bSelfExit) {
      ELeaveVehicle eLeave;
      eLeave.penPlayer = this;
      eLeave.bPositionSpecified = FALSE;
      eLeave.bKillPlayer = FALSE;
      m_penVehicle->SendEvent(eLeave); // notify vehicle that we're leaving
    }

    if (GetShooterVehicle() == NULL) {
      SwitchToModel();
      SetParent(NULL);
    }

    SetCollisionFlags(ECF_MODEL);
    Teleport(plLeavePosition, FALSE);
    CEntityPointer penOldVehicle = m_penVehicle;

    if (m_penEnterExitVehicle == NULL || m_penVehicle == GetSpecifiedVehicle()) {
      SendToTarget(m_penExitVehicleTrigger, EET_TRIGGER, this);
    }

    m_penVehicle = NULL;

    if (bKillPlayer) {
      InflictDirectDamage(this, penOldVehicle, DMT_EXPLOSION, 1400.0f,
        FLOAT3D(0, 0, 0), penOldVehicle->GetPlacement().pl_PositionVector);
    }
  }*/

  void Precache() {
    if ((m_iAvailableWeapons&WEAPON_SINGLESHOTGUN) != 0 || m_iCurrentWeapon == WEAPON_SINGLESHOTGUN) {
      PrecacheModel(MODEL_SINGLESHOTGUN     );    
      PrecacheModel(MODEL_SS_SLIDER         );    
      PrecacheModel(MODEL_SS_HANDLE         );    
      PrecacheModel(MODEL_SS_BARRELS        );    
      PrecacheTexture(TEXTURE_SS_HANDLE);      
      PrecacheTexture(TEXTURE_SS_BARRELS);
      PrecacheSound(SOUND_SINGLESHOTGUN_FIRE);
    }


    if ((m_iAvailableWeapons&WEAPON_DOUBLESHOTGUN) != 0 || m_iCurrentWeapon == WEAPON_DOUBLESHOTGUN) {
      PrecacheSound(SOUND_DS_FIRE);
      PrecacheSound(SOUND_DS_RELOAD);
    }

    if ((m_iAvailableWeapons&WEAPON_TOMMYGUN) != 0 || m_iCurrentWeapon == WEAPON_TOMMYGUN) {
      PrecacheSound(SOUND_TOMMYGUN_FIRE);
    }

    if ((m_iAvailableWeapons&WEAPON_SNIPER) != 0 || m_iCurrentWeapon == WEAPON_SNIPER) {
      PrecacheSound(SOUND_SNIPER_FIRE);
    }

    PrecacheModel(MODEL_FLARE02);
    PrecacheTexture(TEXTURE_FLARE02);
  }

  void PostMoving() {
//    CVehicle* penShooter = GetShooterVehicle();
//    if (penShooter != NULL) {
//      en_vNextPosition = penShooter->GetShooterPosition();
//      SetPlacementFromNextPosition();
//    }

    // ROTATE BODY
    if (m_penTarget != NULL /*&& m_penTarget != m_penVehicle*/) {
      CModelObject *pmoPlayer = this->GetModelObject();
      CAttachmentModelObject *amo = pmoPlayer->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO);
      amo->amo_plRelative.pl_OrientationAngle(2) = Lerp(amo->amo_plRelative.pl_OrientationAngle(2), GetTargetBodyPitch(), 0.5f);
    }

    CMovableModelEntity::PostMoving();

    // never allow a player to be removed from the list of movers
    en_ulFlags &= ~ENF_INRENDERING;
  }

  // set active attachment (model)
  void SetAttachment(INDEX iAttachment) {
    pmoModel = &(pmoModel->GetAttachmentModel(iAttachment)->amo_moModelObject);
  };

  // Set components
  void SetComponents(CModelObject *mo, ULONG ulIDModel, ULONG ulIDTexture,
                     ULONG ulIDReflectionTexture, ULONG ulIDSpecularTexture, ULONG ulIDBumpTexture) {
    // model data
    mo->SetData(GetModelDataForComponent(ulIDModel));
    // texture data
    mo->mo_toTexture.SetData(GetTextureDataForComponent(ulIDTexture));
    // reflection texture data
    if (ulIDReflectionTexture>0) {
      mo->mo_toReflection.SetData(GetTextureDataForComponent(ulIDReflectionTexture));
    } else {
      mo->mo_toReflection.SetData(NULL);
    }
    // specular texture data
    if (ulIDSpecularTexture>0) {
      mo->mo_toSpecular.SetData(GetTextureDataForComponent(ulIDSpecularTexture));
    } else {
      mo->mo_toSpecular.SetData(NULL);
    }
    // bump texture data
    if (ulIDBumpTexture>0) {
      mo->mo_toBump.SetData(GetTextureDataForComponent(ulIDBumpTexture));
    } else {
      mo->mo_toBump.SetData(NULL);
    }
    ModelChangeNotify();
  };

  // Add attachment model
  void AddAttachmentModel(CModelObject *mo, INDEX iAttachment, ULONG ulIDModel, ULONG ulIDTexture,
                          ULONG ulIDReflectionTexture, ULONG ulIDSpecularTexture, ULONG ulIDBumpTexture) {
    SetComponents(&mo->AddAttachmentModel(iAttachment)->amo_moModelObject, ulIDModel, 
                  ulIDTexture, ulIDReflectionTexture, ulIDSpecularTexture, ulIDBumpTexture);
  };

  // Add weapon attachment
  void AddWeaponAttachment(INDEX iAttachment, ULONG ulIDModel, ULONG ulIDTexture,
                           ULONG ulIDReflectionTexture, ULONG ulIDSpecularTexture, ULONG ulIDBumpTexture) {
    AddAttachmentModel(pmoModel, iAttachment, ulIDModel, ulIDTexture,
                       ulIDReflectionTexture, ulIDSpecularTexture, ulIDBumpTexture);
  };

  void RemoveAllWeaponAttachments() {
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_KNIFE);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_COLT_LEFT);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_COLT_RIGHT);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_SINGLE_SHOTGUN);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_DOUBLE_SHOTGUN);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_TOMMYGUN);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_FLAMER);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_MINIGUN);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_ROCKET_LAUNCHER);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_GRENADE_LAUNCHER);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_FLAMER);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_MINIGUN);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_LASER);
    GetBody()->RemoveAttachmentModel(BODY_ATTACHMENT_CANNON);
  }

  void AttachCurrentWeapon() {
    pmoModel = GetModelObject();
    SetAttachment(PLAYER_ATTACHMENT_TORSO);
    switch (m_iCurrentWeapon) {
      // *********** SINGLE SHOTGUN ***********
      case WEAPON_SINGLESHOTGUN:
        AddWeaponAttachment(BODY_ATTACHMENT_SINGLE_SHOTGUN, MODEL_SINGLESHOTGUN, TEXTURE_SS_HANDLE, 0, 0, 0);
        SetAttachment(BODY_ATTACHMENT_SINGLE_SHOTGUN);
        AddWeaponAttachment(SINGLESHOTGUNITEM_ATTACHMENT_BARRELS, MODEL_SS_BARRELS,
                            TEXTURE_SS_BARRELS, 0, 0, 0);
        AddWeaponAttachment(SINGLESHOTGUNITEM_ATTACHMENT_HANDLE, MODEL_SS_HANDLE,
                            TEXTURE_SS_HANDLE, 0, 0, 0);
        AddWeaponAttachment(SINGLESHOTGUNITEM_ATTACHMENT_SLIDER, MODEL_SS_SLIDER,
                            TEXTURE_SS_BARRELS, 0, 0, 0);
        SetAttachment(SINGLESHOTGUNITEM_ATTACHMENT_BARRELS);
        AddWeaponAttachment(BARRELS_ATTACHMENT_FLARE, MODEL_FLARE02, TEXTURE_FLARE02, 0, 0, 0);

        HideFlare(BODY_ATTACHMENT_SINGLE_SHOTGUN, SINGLESHOTGUNITEM_ATTACHMENT_BARRELS, BARRELS_ATTACHMENT_FLARE);
        break;
    // *********** TOMMYGUN ***********
      case WEAPON_TOMMYGUN:
        AddWeaponAttachment(BODY_ATTACHMENT_TOMMYGUN, MODEL_TOMMYGUN, TEXTURE_TG_BODY, 0, 0, 0);
        SetAttachment(BODY_ATTACHMENT_TOMMYGUN);
        AddWeaponAttachment(TOMMYGUNITEM_ATTACHMENT_BODY, MODEL_TG_BODY, TEXTURE_TG_BODY, 0, 0, 0);
        AddWeaponAttachment(TOMMYGUNITEM_ATTACHMENT_SLIDER, MODEL_TG_SLIDER, TEXTURE_TG_BODY, 0, 0, 0);
        SetAttachment(TOMMYGUNITEM_ATTACHMENT_BODY);
        AddWeaponAttachment(BODY_ATTACHMENT_FLARE, MODEL_FLARE02, TEXTURE_FLARE02, 0, 0, 0);
        HideFlare(BODY_ATTACHMENT_TOMMYGUN, TOMMYGUNITEM_ATTACHMENT_BODY, BODY_ATTACHMENT_FLARE);
        break;
    // *********** DOUBLE SHOTGUN ***********
      case WEAPON_DOUBLESHOTGUN:
        AddWeaponAttachment(BODY_ATTACHMENT_DOUBLE_SHOTGUN, MODEL_DOUBLESHOTGUN, TEXTURE_DS_HANDLE, 0, 0, 0);
        SetAttachment(BODY_ATTACHMENT_DOUBLE_SHOTGUN);
        AddWeaponAttachment(DOUBLESHOTGUNITEM_ATTACHMENT_BARRELS, MODEL_DS_BARRELS,
                            TEXTURE_DS_BARRELS, 0, 0, 0);
        AddWeaponAttachment(DOUBLESHOTGUNITEM_ATTACHMENT_HANDLE, MODEL_DS_HANDLE,
                            TEXTURE_DS_HANDLE, 0, 0, 0);
        AddWeaponAttachment(DOUBLESHOTGUNITEM_ATTACHMENT_SWITCH, MODEL_DS_SWITCH,
                            TEXTURE_DS_SWITCH, 0, 0, 0);
        SetAttachment(DOUBLESHOTGUNITEM_ATTACHMENT_BARRELS);
        AddWeaponAttachment(DSHOTGUNBARRELS_ATTACHMENT_FLARE, MODEL_FLARE02, TEXTURE_FLARE02, 0, 0, 0);
        HideFlare(BODY_ATTACHMENT_DOUBLE_SHOTGUN, DOUBLESHOTGUNITEM_ATTACHMENT_BARRELS, DSHOTGUNBARRELS_ATTACHMENT_FLARE);
        break;
    // *********** SNIPER ***********
      case WEAPON_SNIPER:
        AddWeaponAttachment(BODY_ATTACHMENT_FLAMER, MODEL_SNIPER, TEXTURE_SNIPER_BODY, 0, 0, 0);
        SetAttachment(BODY_ATTACHMENT_FLAMER);
        AddWeaponAttachment(SNIPERITEM_ATTACHMENT_BODY, MODEL_SNIPER_BODY, TEXTURE_SNIPER_BODY, 0, 0, 0);
        SetAttachment(SNIPERITEM_ATTACHMENT_BODY);
        AddWeaponAttachment(BODY_ATTACHMENT_FLARE, MODEL_FLARE02, TEXTURE_FLARE02, 0, 0, 0);
        HideFlare(BODY_ATTACHMENT_FLAMER, SNIPERITEM_ATTACHMENT_BODY, BODY_ATTACHMENT_FLARE);
        break;
    }
  }

  void ShowCurrentFlare() {
    switch (m_iCurrentWeapon) {
      case WEAPON_SINGLESHOTGUN: ShowFlare(BODY_ATTACHMENT_SINGLE_SHOTGUN, SINGLESHOTGUNITEM_ATTACHMENT_BARRELS, BARRELS_ATTACHMENT_FLARE); break;
      case WEAPON_TOMMYGUN: ShowFlare(BODY_ATTACHMENT_TOMMYGUN, TOMMYGUNITEM_ATTACHMENT_BODY, BODY_ATTACHMENT_FLARE); break;
      case WEAPON_SNIPER: ShowFlare(BODY_ATTACHMENT_FLAMER, SNIPERITEM_ATTACHMENT_BODY, BODY_ATTACHMENT_FLARE); break;
      case WEAPON_DOUBLESHOTGUN: ShowFlare(BODY_ATTACHMENT_DOUBLE_SHOTGUN, DOUBLESHOTGUNITEM_ATTACHMENT_BARRELS, DSHOTGUNBARRELS_ATTACHMENT_FLARE); break;
    }
  }

  void HideCurrentFlare() {
    switch (m_iCurrentWeapon) {
      case WEAPON_SINGLESHOTGUN: HideFlare(BODY_ATTACHMENT_SINGLE_SHOTGUN, SINGLESHOTGUNITEM_ATTACHMENT_BARRELS, BARRELS_ATTACHMENT_FLARE); break;
      case WEAPON_TOMMYGUN: HideFlare(BODY_ATTACHMENT_TOMMYGUN, TOMMYGUNITEM_ATTACHMENT_BODY, BODY_ATTACHMENT_FLARE); break;
      case WEAPON_SNIPER: HideFlare(BODY_ATTACHMENT_FLAMER, SNIPERITEM_ATTACHMENT_BODY, BODY_ATTACHMENT_FLARE); break;
      case WEAPON_DOUBLESHOTGUN: HideFlare(BODY_ATTACHMENT_DOUBLE_SHOTGUN, DOUBLESHOTGUNITEM_ATTACHMENT_BARRELS, DSHOTGUNBARRELS_ATTACHMENT_FLARE); break;
    }
  }

  void ReceiveDamage(CEntity *penInflictor, enum DamageType dmtType,
    FLOAT fDamageAmmount, const FLOAT3D &vHitPoint, const FLOAT3D &vDirection) 
  {
    if (IsOfClass(penInflictor, "Player") && !m_bReceivePlayerDamage) {
      return;
    }

    if (IsOfClass(penInflictor, "Friend")) {
      return;
    }

    /*if (m_penVehicle != NULL) {
      return;
    }*/

    FLOAT fNewDamage = fDamageAmmount;

    // if it has no spray, or if this damage overflows it, and not already disappearing
    if ((m_tmSpraySpawned<=_pTimer->CurrentTick()-_pTimer->TickQuantum*2 || 
      m_fSprayDamage+fNewDamage>50.0f) &&
      dmtType!=DMT_CHAINSAW && 
      !(dmtType==DMT_BURNING && GetHealth()<0) ) {

      // spawn blood spray
      CPlacement3D plSpray = CPlacement3D( vHitPoint, ANGLE3D(0, 0, 0));
      m_penSpray = CreateEntity( plSpray, CLASS_BLOOD_SPRAY);
      if(m_sptType != SPT_ELECTRICITY_SPARKS)
      {
        m_penSpray->SetParent( this);
      }

      ESpawnSpray eSpawnSpray;
      eSpawnSpray.colBurnColor=C_WHITE|CT_OPAQUE;
      
      if( m_fMaxDamageAmmount > 10.0f)
      {
        eSpawnSpray.fDamagePower = 3.0f;
      }
      else if(m_fSprayDamage+fNewDamage>50.0f)
      {
        eSpawnSpray.fDamagePower = 2.0f;
      }
      else
      {
        eSpawnSpray.fDamagePower = 1.0f;
      }

      eSpawnSpray.sptType = m_sptType;
      eSpawnSpray.fSizeMultiplier = 1.0f;

      // setup direction of spray
      FLOAT3D vHitPointRelative = vHitPoint - GetPlacement().pl_PositionVector;
      FLOAT3D vReflectingNormal;
      GetNormalComponent( vHitPointRelative, en_vGravityDir, vReflectingNormal);
      vReflectingNormal.SafeNormalize();
      
      vReflectingNormal(1)/=5.0f;
    
      FLOAT3D vProjectedComponent = vReflectingNormal*(vDirection%vReflectingNormal);
      FLOAT3D vSpilDirection = vDirection-vProjectedComponent*2.0f-en_vGravityDir*0.5f;

      eSpawnSpray.vDirection = vSpilDirection;
      eSpawnSpray.penOwner = this;
    
      /*if (dmtType==DMT_BURNING && GetHealth()<0)
      {
        eSpawnSpray.fDamagePower = 1.0f;
      }*/

      // initialize spray
      m_penSpray->Initialize( eSpawnSpray);
      m_tmSpraySpawned = _pTimer->CurrentTick();
      m_fSprayDamage = 0.0f;
      m_fMaxDamageAmmount = 0.0f;
    }
    m_fSprayDamage+=fNewDamage;

    CMovableModelEntity::ReceiveDamage(penInflictor, dmtType, fNewDamage, vHitPoint, vDirection);
  }

/*  class CVehicle* GetShooterVehicle() {
    if (m_penVehicle != NULL) {
      CVehicle* penVehicle = ((CVehicle*)&*m_penVehicle);
      if (penVehicle->m_penShooter == this) {
        return penVehicle;
      }
    }
    return NULL;
  }*/

  CModelObject *GetBody(void)
  {
    return &GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
  }

  void RunningAnim(ULONG ulMovementFlags) {
    GetModelObject()->PlayAnim((ulMovementFlags&MF_MOVE_PLUS_Z) ? PLAYER_ANIM_BACKPEDALRUN : PLAYER_ANIM_RUN, AOF_LOOPING|AOF_NORESTART);
  }

  void StandingAnim(ULONG ulMovementFlags) {
    switch (m_iCurrentWeapon) {
      case WEAPON_NONE:
        GetBody()->PlayAnim(BODY_ANIM_DEFAULT_ANIMATION, AOF_LOOPING|AOF_NORESTART);
      break;
      case WEAPON_SINGLESHOTGUN: 
      case WEAPON_SNIPER:
      case WEAPON_DOUBLESHOTGUN:
        GetBody()->PlayAnim(BODY_ANIM_SHOTGUN_STAND, AOF_LOOPING|AOF_NORESTART);
        break;
    }
    GetModelObject()->PlayAnim(PLAYER_ANIM_STAND, AOF_LOOPING|AOF_NORESTART);
  }

  void RotatingAnim(ULONG ulMovementFlags) {
    GetModelObject()->PlayAnim(PLAYER_ANIM_TURNLEFT, AOF_LOOPING|AOF_NORESTART);
  }

  void DeathAnim() {
    GetModelObject()->PlayAnim(PLAYER_ANIM_DEATH_BACK, 0);
    GetBody()->PlayAnim(BODY_ANIM_DEATH_BACK, 0);
  }

  // leave stain
  virtual void LeaveStain( BOOL bGrow)
  {
    ESpawnEffect ese;
    FLOAT3D vPoint;
    FLOATplane3D vPlaneNormal;
    FLOAT fDistanceToEdge;
    // get your size
    FLOATaabbox3D box;
    GetBoundingBox(box);
  
    // on plane
    if( GetNearestPolygon(vPoint, vPlaneNormal, fDistanceToEdge)) {
      // if near to polygon and away from last stain point
      if( (vPoint-GetPlacement().pl_PositionVector).Length()<0.5f
        && (m_vLastStain-vPoint).Length()>1.0f ) {
        m_vLastStain = vPoint;
        FLOAT fStretch = box.Size().Length();
        ese.colMuliplier = C_WHITE|CT_OPAQUE;
        // stain
        if (bGrow) {
          ese.betType    = BET_BLOODSTAINGROW;
          ese.vStretch   = FLOAT3D( fStretch*1.5f, fStretch*1.5f, 1.0f);
        } else {
          ese.betType    = BET_BLOODSTAIN;
          ese.vStretch   = FLOAT3D( fStretch*0.75f, fStretch*0.75f, 1.0f);
        }
        ese.vNormal    = FLOAT3D( vPlaneNormal);
        ese.vDirection = FLOAT3D( 0, 0, 0);
        FLOAT3D vPos = vPoint+ese.vNormal/50.0f*(FRnd()+0.5f);
        CEntityPointer penEffect = CreateEntity( CPlacement3D(vPos, ANGLE3D(0,0,0)), CLASS_BASIC_EFFECT);
        penEffect->Initialize(ese);
      }
    }
  };

  // set desired rotation and translation to go/orient towards desired position
  // and get the resulting movement type
  virtual ULONG SetDesiredMovement(void)
  {
    ULONG ulFlags = 0;

    // get delta to desired position
    FLOAT3D vDelta = m_vDesiredPosition - GetPlacement().pl_PositionVector;
    ANGLE m_aRotateSpeed = FRnd()*200 + 600.0f;

    // if we may rotate
    if (m_aRotateSpeed>0.0f) {
      // get desired heading orientation
      FLOAT3D vDir = vDelta;
      vDir.SafeNormalize();
      ANGLE aWantedHeadingRelative = GetRelativeHeading(vDir);

      // normalize it to [-180,+180] degrees
      aWantedHeadingRelative = NormalizeAngle(aWantedHeadingRelative);

      ANGLE aHeadingRotation;
      // if desired position is left
      if (aWantedHeadingRelative < -m_aRotateSpeed*m_fMoveFrequency) {
        // start turning left
        aHeadingRotation = -m_aRotateSpeed;
      // if desired position is right
      } else if (aWantedHeadingRelative > m_aRotateSpeed*m_fMoveFrequency) {
        // start turning right
        aHeadingRotation = +m_aRotateSpeed;
      // if desired position is more-less ahead
      } else {
        // keep just the adjusting fraction of speed 
        aHeadingRotation = aWantedHeadingRelative/m_fMoveFrequency;
      }
      // start rotating
      SetDesiredRotation(ANGLE3D(aHeadingRotation, 0, 0));
      
      if (Abs(aHeadingRotation)>1.0f) {
        ulFlags |= MF_ROTATEH;
      }

    // if we may not rotate
    } else {
      // stop rotating
      SetDesiredRotation(ANGLE3D(0, 0, 0));
    }
    

    if ((m_flBehaviourFlags&BF_MOVING)) {
      BOOL bTargetIsEnemy = IsDerivedFromClass(m_penTarget, "Enemy Base");
      BOOL bTargetIsPlayer = IsOfClass(m_penTarget, "Player");
      BOOL bTargetIsVehicle = IsOfClass(m_penTarget, "Vehicle");
      BOOL bTargetIsMarker = IsOfClass(m_penTarget, "Marker");
      BOOL bTargetIsFriendMarker = IsOfClass(m_penTarget, "Friend Marker");
      FLOAT fDistanceToTarget = CalcDist(m_penTarget);

      BOOL bStandAndShootEnemy = fDistanceToTarget > m_fEnemyStopDistance && fDistanceToTarget < m_fEnemyStopDistance+1.0f;

      BOOL bRun = (bTargetIsEnemy && !bStandAndShootEnemy) || 
        (((bTargetIsPlayer || bTargetIsVehicle) && fDistanceToTarget > m_fPlayerStopDistance) ||
          (bTargetIsMarker && fDistanceToTarget > 1.0f) ||
          (bTargetIsFriendMarker && fDistanceToTarget > 0.0f));

      // if we may move
      if (m_fMoveSpeed>0.0f && bRun /*&& m_penVehicle == NULL*/) {
        // determine translation speed
        FLOAT3D vTranslation(0.0f, 0.0f, 0.0f);
        vTranslation(3) = -m_fMoveSpeed;

        BOOL bRunBackwards = bTargetIsEnemy && CalcDist(m_penTarget) < m_fEnemyStopDistance;

        if (bRunBackwards) {
          ulFlags |= MF_MOVE_PLUS_Z;
          vTranslation(3) = m_fMoveSpeed;
        }

        // start moving
        SetDesiredTranslation(vTranslation);

        ulFlags |= MF_MOVEZ;

      // if we may not move
      } else {
        // stop translating
        SetDesiredTranslation(FLOAT3D(0, 0, 0));
      }
    } else {
      SetDesiredTranslation(FLOAT3D(0, 0, 0));
    }

    return ulFlags;
  };

  // stop desired rotation
  void StopRotating() 
  {
    SetDesiredRotation(ANGLE3D(0, 0, 0));
  };

  // stop desired translation
  void StopTranslating() 
  {
    SetDesiredTranslation(FLOAT3D(0.0f, 0.0f, 0.0f));
  };


  ANGLE GetDefaultBodyPitch() {
	  CModelObject *pmoPlayer = this->GetModelObject();
	  CAttachmentModelObject *amo = pmoPlayer->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO);
	  return amo->amo_plRelative.pl_OrientationAngle(2);
  }

  ANGLE GetTargetBodyPitch() {
    CModelObject *pmoPlayer = this->GetModelObject();
    CAttachmentModelObject *amo = pmoPlayer->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO);

    CPlacement3D myPlacement = GetPlacement();
    CPlacement3D targetPlacement = m_penTarget->GetPlacement();


    FLOAT fEnemyX = targetPlacement.pl_PositionVector(1);
    FLOAT fFriendX = myPlacement.pl_PositionVector(1);
    FLOAT fEnemyY = targetPlacement.pl_PositionVector(2);
    FLOAT fFriendY = myPlacement.pl_PositionVector(2);
    FLOAT fEnemyZ = targetPlacement.pl_PositionVector(3);
    FLOAT fFriendZ = myPlacement.pl_PositionVector(3);
    FLOAT dx = abs(fEnemyX-fFriendX);	
    FLOAT dy = abs(fEnemyY-fFriendY);
    FLOAT dz = abs(fEnemyZ-fFriendZ);
    if (dy == 0) {
      return m_aDefaultBodyPitch;
    }
    ANGLE aSinAngle = dy/sqrt(dx*dx+dy*dy+dz*dz);
    ANGLE aDesired = asin(aSinAngle); // angle in radian
    ANGLE aDegree = aDesired*57.29f; // angle in degrees

    ANGLE aAngle = aDegree;
    if (fEnemyY > fFriendY) {
      return  m_aDefaultBodyPitch + aAngle;
    } else {
      return m_aDefaultBodyPitch - aAngle;
    }

    return m_aDefaultBodyPitch;
  }

  // calc distance to entity in one plane (relative to owner gravity)
  FLOAT CalcDistanceInPlaneToDestination(void) 
  {
    // find vector from you to target in XZ plane
    FLOAT3D vNormal;
    GetNormalComponent(m_vDesiredPosition - GetPlacement().pl_PositionVector, en_vGravityDir, vNormal);
    return vNormal.Length();
  };

  // calc distance to entity in one plane (relative to owner gravity)
  FLOAT CalcDistanceInPlaneToMarkerDestination(void) 
  {
    // find vector from you to target in XZ plane
    FLOAT3D vNormal;
    GetNormalComponent(m_vMarkerDestination - GetPlacement().pl_PositionVector, en_vGravityDir, vNormal);
    return vNormal.Length();
  };

  // calculate delta to given entity
  FLOAT3D CalcDelta(CEntity *penEntity) 
  {
    ASSERT(penEntity!=NULL);
    // find vector from you to target
    return penEntity->GetPlacement().pl_PositionVector - GetPlacement().pl_PositionVector;
  };

  // calculate distance to given entity
  FLOAT CalcDist(CEntity *penEntity) 
  {
    return CalcDelta(penEntity).Length();
  };

  // show flare
  void ShowFlare(INDEX iAttachWeapon, INDEX iAttachObject, INDEX iAttachFlare) {
    CAttachmentModelObject *pamo = GetModelObject()->GetAttachmentModelList(
      PLAYER_ATTACHMENT_TORSO, iAttachWeapon, iAttachObject, iAttachFlare, -1);
    if (pamo!=NULL) {
      pamo->amo_plRelative.pl_OrientationAngle(3) = (rand()*360.0f)/RAND_MAX;
      CModelObject &mo = pamo->amo_moModelObject;
      mo.StretchModel(FLOAT3D(1, 1, 1));
    }
  };

  // hide flare
  void HideFlare(INDEX iAttachWeapon, INDEX iAttachObject, INDEX iAttachFlare) {
    CAttachmentModelObject *pamo = GetModelObject()->GetAttachmentModelList(
      PLAYER_ATTACHMENT_TORSO, iAttachWeapon, iAttachObject, iAttachFlare, -1);
    if (pamo!=NULL) {
      CModelObject &mo = pamo->amo_moModelObject;
      mo.StretchModel(FLOAT3D(0, 0, 0));
    }
  };

  CEntityPointer FindClosestEnemy() {

    // TODO: NETWORK UNSAFE
    CDynamicContainer<CEntity> container = GetSP()->sp_bSinglePlayer ? ((CMusicHolder*)&*m_penMusicHolder)->m_cenFussMakers : GetWorld()->wo_cenEntities;

    CEntityPointer penClosest = NULL;
    FLOAT fMinDistance = 10000.0f;

    CDynamicContainer<CEntity> closestEnemies;

    // for each entity in the world
    {FOREACHINDYNAMICCONTAINER(container, CEntity, iten) {
      CEntity *pen = iten;
      if (pen != NULL && IsDerivedFromClass(pen, "Enemy Base") && !IsOfClass(pen, "Character")) {

        if ((m_strIgnoreTarget1 != "" && IsOfClass(pen, m_strIgnoreTarget1)) || 
            (m_strIgnoreTarget2 != "" && IsOfClass(pen, m_strIgnoreTarget2)) ||
            (m_strIgnoreTarget3 != "" && IsOfClass(pen, m_strIgnoreTarget3))) {
          continue; 
        }

        CEnemyBase *penEnemy = (CEnemyBase *)pen;
        if (!penEnemy->m_bTemplate && (penEnemy->GetFlags()&ENF_ALIVE)) {
          FLOAT fDistance = CalcDist(penEnemy);
          if (fDistance < fMinDistance && fDistance < m_fDetectEnemyDistance) {
            if (closestEnemies.Count() == 3) {
              closestEnemies.Remove(closestEnemies.Pointer(0));
            }

            penClosest = penEnemy;
            fMinDistance = fDistance;

            closestEnemies.Add(pen);
          }
        }
      }
    }}

    for (int i = closestEnemies.Count()-1; i >= 0; i--) {
      CEntityPointer pen = closestEnemies.Pointer(i);
      if (SeeEntity(pen, Cos(180.0f))) {
        return pen;
      }
    }

    return NULL;
  }

  FLOAT3D DetermineDesiredPosition(CEntityPointer pen) {
    if (IsOfClass(pen, "Friend Marker")) {
      if (m_bCalculatedMarkerDestination) {
        return m_vMarkerDestination;
      }

      CFriendMarker* penMarker = ((CFriendMarker*)&*pen);
      FLOAT fR = FRnd()*penMarker->m_fMarkerRange;
      FLOAT fA = FRnd()*360.0f;
      m_bCalculatedMarkerDestination = TRUE;
      m_vMarkerDestination = pen->GetPlacement().pl_PositionVector+FLOAT3D(CosFast(fA)*fR, 0, SinFast(fA)*fR);
      return m_vMarkerDestination;
    }

    return pen->GetPlacement().pl_PositionVector;
  }

  CEntityPointer DetermineTargetEntity() {
    if (m_penTarget != NULL && IsDerivedFromClass(m_penTarget, "Enemy Base")) {
      CEnemyBase* penEnemy = ((CEnemyBase*)&*m_penTarget);
      BOOL bAlive = penEnemy->GetFlags()&ENF_ALIVE;
      if (m_tmNextSwitchTarget > _pTimer->GetLerpedCurrentTick()) { // still can attack the same target
        if (bAlive && CalcDist(m_penTarget) < m_fDetectEnemyDistance) {
          return m_penTarget; // attack the same enemy
        }
      } else { // time to switch or check the target visibility
        if (bAlive && CalcDist(m_penTarget) < m_fDetectEnemyDistance && SeeEntity(m_penTarget, Cos(180.0f))) {
          m_tmNextSwitchTarget = _pTimer->GetLerpedCurrentTick() + 1.0f; // enemy is still in field of vision
          return m_penTarget;
        }
      }
    }

    // find enemies
    if ((m_flBehaviourFlags&BF_SHOOTING) /*&& (m_penVehicle == NULL || GetShooterVehicle() != NULL)*/ && m_tmNextFindClosestEnemy < _pTimer->GetLerpedCurrentTick()) {
      CEntityPointer penNewEnemy = FindClosestEnemy();
      m_tmNextFindClosestEnemy = _pTimer->GetLerpedCurrentTick() + 0.5f;
      if (penNewEnemy != NULL) {
        m_tmNextSwitchTarget = _pTimer->GetLerpedCurrentTick() + 2.0f;
        return penNewEnemy;
      }
    }

    // go to marker
    if (m_penMarker != NULL /*&& m_penVehicle == NULL*/) {
      if (IsOfClass(m_penMarker, "Friend Marker") && m_penTarget == m_penMarker && CalcDistanceInPlaneToMarkerDestination() <= 1.0f) {
        SendToTarget(((CFriendMarker*)&*m_penMarker)->m_penTrigger, EET_TRIGGER, this);
        m_penMarker = ((CFriendMarker*)&*m_penMarker)->m_penTarget;
        m_bCalculatedMarkerDestination = FALSE;
      }
      return m_penMarker;
    }

    // cannot find any enemies, go to player
    if ((m_flBehaviourFlags&BF_FOLLOW_PLAYER)) {
      if (m_penPlayer == NULL) {
        m_penPlayer = FindClosestPlayer();
      }

/*      if (m_penPlayer != NULL) {
        return ((CPlayer*)&*m_penPlayer)->m_penVehicle != NULL ? ((CPlayer*)&*m_penPlayer)->m_penVehicle : m_penPlayer;
      }*/
    }

    // todo...

    return NULL;
  }
 

  CEntityPointer FindClosestPlayer() {
    CEntityPointer pen;
    FLOAT fMinDistance = 10000.0f;
    for (int i = 0; i < GetMaxPlayers(); i++) {
      if (GetPlayerEntity(i) == NULL) { continue; }
      CPlayer* penPlayer = ((CPlayer*)&*GetPlayerEntity(i));
      if ((penPlayer->GetFlags()&ENF_ALIVE) && !(penPlayer->GetFlags()&ENF_INVISIBLE)) {
        FLOAT fDistance = CalcDist(penPlayer);
        if (fDistance < fMinDistance) {
          fMinDistance = fDistance;
          pen = penPlayer;
        }
      }
    }

    return pen;
  }

  // determine if you can see something in given direction
  BOOL IsInFrustum(CEntity *penEntity, FLOAT fCosHalfFrustum) 
  {
    // get direction to the entity
    FLOAT3D vDelta = CalcDelta(penEntity);
    // find front vector
    FLOAT3D vFront = -GetRotationMatrix().GetColumn(3);
    // make dot product to determine if you can see target (view angle)
    FLOAT fDotProduct = (vDelta/vDelta.Length())%vFront;
    return fDotProduct >= fCosHalfFrustum;
  };

  // see entity
  BOOL SeeEntity(CEntity *pen, FLOAT fCosAngle) {
    if (IsInFrustum(pen, fCosAngle)) {
      return IsVisible(pen);
    }
    return FALSE;
  };

  // cast a ray to entity checking only for brushes
  BOOL IsVisible(CEntity *penEntity) 
  {
    ASSERT(penEntity!=NULL);
    // get ray source and target
    FLOAT3D vSource, vTarget;
    GetPositionCastRay(this, penEntity, vSource, vTarget);

    // cast the ray
    CCastRay crRay(this, vSource, vTarget);
    crRay.cr_ttHitModels = CCastRay::TT_NONE;
    crRay.cr_bHitTranslucentPortals = FALSE;
    en_pwoWorld->CastRay(crRay);

    //CPrintF("Friend raycast from %s to %s, tick %f\n", GetName(), penEntity->GetName(), _pTimer->GetLerpedCurrentTick());

    // if hit nothing (no brush) the entity can be seen
    return (crRay.cr_penHit==NULL);     
  };


  // prepare Bullet
  void PrepareBullet(FLOAT fX, FLOAT fY, FLOAT fDamage) {
    plBullet = GetPlacement();
    plBullet.pl_PositionVector(2) += 1.5f;
    // create bullet
    penBullet = CreateEntity(plBullet, CLASS_BULLET);
    // init bullet
    EBulletInit eInit;
//    eInit.penIgnoreEntity1 = GetShooterVehicle();
    eInit.penOwner = this;
    eInit.fDamage = fDamage;
    penBullet->Initialize(eInit);
  };

  // prepare Bullet
  void PrepareSniperBullet(FLOAT fX, FLOAT fY, FLOAT fDamage, FLOAT fImprecission) {
    // bullet start position
    plBullet = GetPlacement();
    plBullet.pl_PositionVector(2) += 1.5f;

    plBullet.pl_OrientationAngle = ANGLE3D((FRnd()-0.5f)*fImprecission, (FRnd()-0.5f)*fImprecission, 0);

    // create bullet
    penBullet = CreateEntity(plBullet, CLASS_BULLET);
    m_vBulletSource = plBullet.pl_PositionVector;
	// init bullet
    EBulletInit eInit;
//    eInit.penIgnoreEntity1 = GetShooterVehicle();
    eInit.penOwner = this;
    eInit.fDamage = fDamage;
    penBullet->Initialize(eInit);
  };


  // WEAPON FIRING FUNCTIONS


  BOOL CanShootAtEnemy() {
    // must have behaviour flag
    if (!(m_flBehaviourFlags&BF_SHOOTING)) {
      return FALSE;
    }

    // must have enemy base target
    if (m_penTarget == NULL || !IsDerivedFromClass(m_penTarget, "Enemy Base")) {
      return FALSE;
    }

    // cannot shoot for now (reloading)
    if (m_tmNextShootTime > _pTimer->GetLerpedCurrentTick()) {
      return FALSE;
    }

    // target is too far
    if (CalcDist(m_penTarget) > GetFireDistanceForCurrentWeapon()) {
      return FALSE;
    }

    // if not in vehicle, or if friend is shooter
    /*if ((m_penVehicle == NULL || GetShooterVehicle() != NULL)) {
      return SeeEntity(m_penTarget, Cos(15.0f));
    }

    return FALSE;*/
    return SeeEntity(m_penTarget, Cos(15.0f));
  }

  // fire bullets (x offset is used for double shotgun)
  void FireBullets(FLOAT fX, FLOAT fY, FLOAT fRange, FLOAT fDamage, INDEX iBullets,
    FLOAT *afPositions, FLOAT fStretch, FLOAT fJitter) {
    PrepareBullet(fX, fY, fDamage);
    ((CBullet&)*penBullet).CalcTarget(m_penTarget, fRange);
    ((CBullet&)*penBullet).m_fBulletSize = GetSP()->sp_bCooperative ? 0.1f : 0.3f;
    // launch slugs
    INDEX iSlug;
    for (iSlug=0; iSlug<iBullets; iSlug++) {
      // launch bullet
      ((CBullet&)*penBullet).CalcJitterTargetFixed(
        afPositions[iSlug*2+0]*fRange*fStretch, afPositions[iSlug*2+1]*fRange*fStretch,
        fJitter*fRange*fStretch);
      BOOL bTrail = TRUE;
      ((CBullet&)*penBullet).LaunchBullet(iSlug<2, bTrail, TRUE);
    }
    ((CBullet&)*penBullet).DestroyBullet();
  };

  // fire one bullet for machine guns (tommygun and minigun)
  void FireMachineBullet(FLOAT fX, FLOAT fY, FLOAT fRange, FLOAT fDamage, 
    FLOAT fJitter, FLOAT fBulletSize)
  {
    fJitter*=fRange;  // jitter relative to range
    PrepareBullet(fX, fY, fDamage);
    ((CBullet&)*penBullet).CalcTarget(fRange);
    ((CBullet&)*penBullet).m_fBulletSize = fBulletSize;
    ((CBullet&)*penBullet).CalcJitterTarget(fJitter);
    ((CBullet&)*penBullet).LaunchBullet(TRUE, FALSE, TRUE);
    ((CBullet&)*penBullet).DestroyBullet();
  }

  // fire one bullet
  void FireSniperBullet(FLOAT fX, FLOAT fY, FLOAT fRange, FLOAT fDamage, FLOAT fImprecission) {
    PrepareSniperBullet(fX, fY, fDamage, fImprecission);
    ((CBullet&)*penBullet).CalcTarget(m_penTarget, fRange);
    ((CBullet&)*penBullet).m_fBulletSize = 0.1f;
    // launch bullet
    ((CBullet&)*penBullet).LaunchBullet(TRUE, FALSE, TRUE);
    
    if (((CBullet&)*penBullet).m_vHitPoint != FLOAT3D(0.0f, 0.0f, 0.0f)) {
      m_vBulletTarget = ((CBullet&)*penBullet).m_vHitPoint;
    } else if (TRUE) {
      m_vBulletTarget = m_vBulletSource + FLOAT3D(0.0f, 0.0f, -500.0f)*((CBullet&)*penBullet).GetRotationMatrix();
      
    }

    // spawn bullet effect
    /*ESpawnEffect ese;
    ese.colMuliplier = C_WHITE|CT_OPAQUE;
    ese.betType = BET_SNIPER_RESIDUE;
    ese.vStretch = FLOAT3D(1.0f, 1.0f, 1.0f);
    ese.vNormal = m_vBulletSource;
    ese.vDirection = ((CBullet&)*penBullet).m_vHitPoint;
    CPlacement3D pl = CPlacement3D(GetPlacement().pl_PositionVector, ANGLE3D(0.0f, 0.0f, 0.0f));
    CEntityPointer penFX = CreateEntity(pl, CLASS_BASIC_EFFECT);
    penFX->Initialize(ese);*/
    
	  // bullet no longer needed
	  ((CBullet&)*penBullet).DestroyBullet();
  };

  void FireShotgun() {
    PlaySound(m_soWeapon0, SOUND_SINGLESHOTGUN_FIRE, SOF_3D);
    FireBullets(0.0f, 1.5f, 
      500.0f, 10.0f, 7, afSingleShotgunPellets, 0.2f, 0.03f);

    m_tmNextShootTime = _pTimer->GetLerpedCurrentTick() + 1.3f;
  }

  void FireDoubleShotgun() {
    PlaySound(m_soWeapon0, SOUND_DS_FIRE, SOF_3D);
    PlaySound(m_soWeapon1, SOUND_DS_RELOAD, SOF_3D);
    FireBullets(0.0f, 1.5f,
      500.0f, 10.0f, 14, afDoubleShotgunPellets, 0.3f, 0.03f);

    m_tmNextShootTime = _pTimer->GetLerpedCurrentTick() + 2.0f;
  }

  void FireTommygun() {
    PlaySound(m_soWeapon0, SOUND_TOMMYGUN_FIRE, SOF_3D);
    FireMachineBullet(0.0f, 1.5f,
      500.0f, 10.0f, ((GetSP()->sp_bCooperative) ? 0.01f : 0.03f),
      ((GetSP()->sp_bCooperative) ? 0.5f : 0.0f));

    m_tmNextShootTime = _pTimer->GetLerpedCurrentTick() + 0.05f;    
  }

  void FireSniper() {
    PlaySound(m_soWeapon0, SOUND_SNIPER_FIRE, SOF_3D);
    FLOAT fImprecision = 0.05f;
/*    if (GetShooterVehicle() != NULL) {
      CVehicle* penVehicle = GetShooterVehicle();
      fImprecision += (penVehicle->m_fDesiredSpeed/penVehicle->m_fMaxForwardSpeed) * 1.0f;
    }*/
    FireSniperBullet(0.0f, 1.5f, 1500.0f, 90.0f, fImprecision);

    m_tmLastSniperFire = _pTimer->GetLerpedCurrentTick() + 0.05f;

    m_tmNextShootTime = _pTimer->GetLerpedCurrentTick() + 2.0f;        
  }

  FLOAT GetFireDistanceForCurrentWeapon() {

    if (m_fWeaponRangeOverride > 0) {
      return m_fWeaponRangeOverride;
    }

    switch (m_iCurrentWeapon) {
      case WEAPON_SINGLESHOTGUN: return 20.0f;
      case WEAPON_DOUBLESHOTGUN: return 20.0f;
      case WEAPON_TOMMYGUN: return 40.0f;
      case WEAPON_SNIPER: return 200.0f;
    }

    return -10.0f;
  }

procedures:

Death(EDeath eDeath) {
  HideCurrentFlare();
  SetFlags(GetFlags()&~ENF_ALIVE); // really dead
  LeaveStain(TRUE);
  DeathAnim();
  StopTranslating();
  StopRotating();
  SetCollisionFlags(ECF_IMMATERIAL);
  SendToTarget(m_penDeathTarget, EET_TRIGGER, this);

  wait(10.0f) {
    on (ETimer) : {
      stop;
    }
    on (EEnd) : {
      stop;
    }
  }
  Destroy();
  return;
}



MainLoop() {
  while (GetFlags()&ENF_ALIVE) {
    if (!m_bHidden) {
      m_penTarget = DetermineTargetEntity();

      if (m_penTarget != NULL) {
        m_vDesiredPosition = DetermineDesiredPosition(m_penTarget);

        ULONG ulFlags = SetDesiredMovement();
        if (ulFlags&MF_MOVEZ) {
          RunningAnim(ulFlags);
        } else {
          StopTranslating();
          if (ulFlags&MF_ROTATEH) {
            RotatingAnim(ulFlags);
          } else {
            StandingAnim(ulFlags);
          }
        }
      }

      // ENTER VEHICLE
/*      if ((m_flBehaviourFlags&BF_ENTER_CAR) && m_penVehicle == NULL && m_penTarget != NULL && CalcDist(m_penTarget) <= m_fPlayerStopDistance && 
          IsOfClass(m_penTarget, "Vehicle") && ((CVehicle*)&*m_penTarget)->AtLeastOnePlaceIsAvailable() && abs(((CVehicle*)&*m_penTarget)->m_fDesiredSpeed) < 3.0f) {
        BOOL bShooter = m_flBehaviourFlags&BF_VEHICLE_SHOOTER && ((CVehicle*)&*m_penTarget)->m_penShooter == NULL;

        EnterVehicle(m_penTarget, bShooter);
      }

      BOOL bLeaveVehicle = ((m_flBehaviourFlags&BF_FOLLOW_PLAYER) && m_penPlayer != NULL && ((CPlayer*)&*m_penPlayer)->m_penVehicle == NULL) || (m_flBehaviourFlags&BF_FOLLOW_PLAYER) == 0; 

      // LEAVE VEHICLE
      if ((m_flBehaviourFlags&BF_LEAVE_CAR) && m_penVehicle != NULL && bLeaveVehicle) {

        CPlacement3D plLeave;
        if (((CVehicle*)&*m_penVehicle)->GetLeavePosition(plLeave)) {
          LeaveVehicle(plLeave, FALSE, TRUE);
        }
      }*/

      if (CanShootAtEnemy()) {
        switch (m_iCurrentWeapon) {
          case WEAPON_SINGLESHOTGUN: FireShotgun(); break;
          case WEAPON_DOUBLESHOTGUN: FireDoubleShotgun(); break;
          case WEAPON_TOMMYGUN: FireTommygun(); break;
          case WEAPON_SNIPER: FireSniper(); break;
        }

        /*if (m_tmNextEvadeSend < _pTimer->GetLerpedCurrentTick() && ((CEnemyBase*)&*m_penTarget)->CanEvadeNow(this)) {
          EEvade eEvade;
          eEvade.penSender = this;
          m_penTarget->SendEvent(eEvade);
          m_tmNextEvadeSend = _pTimer->GetLerpedCurrentTick() + 0.5f;
        }*/

        ShowCurrentFlare();
        m_bHideFlare = TRUE;
      }

      if (m_penTarget == NULL) {
        StopTranslating();
        StopRotating();
        StandingAnim(0);
      }
    }

    // wait a bit always (to prevent eventual busy-looping)
    autowait(m_bHidden ? 2.0f : m_fMoveFrequency);

    if (m_bHideFlare) {
      HideCurrentFlare();
    }
    m_bHideFlare = FALSE;
  }

  return;
};


  Main()
  {
    // declare yourself as a model
    InitAsModel();
    SetPhysicsFlags(EPF_MODEL_WALKING|EPF_HASLUNGS);
    SetCollisionFlags(ECF_MODEL);
    SetFlags(GetFlags()|ENF_ALIVE);
    en_tmMaxHoldBreath = 25.0f;
    en_fDensity = 1200.0f;
    SetHealth(m_fMaxHealth);

    if (m_fnAmc == NULL || m_fnAmc == "") {
      m_fnAmc = CTFILENAME("ModelsMP\\CutSequences\\Santa\\Santa.amc");
    }

    m_fMoveFrequency = Max(0.05f, m_fMoveFrequency);

    // set your appearance
    CTString strDummy;
    extern BOOL SetPlayerAppearance_internal(CModelObject *pmo, const CTFileName &fnmAMC, CTString &strName, BOOL bPreview);
    SetPlayerAppearance_internal(GetModelObject(), m_fnAmc, strDummy, /*bPreview=*/FALSE);

    ModelChangeNotify(); // must do this, otherwise will be not visible
    StandingAnim(0);
    AttachCurrentWeapon();

    if (m_bTemplate) {
      return;
    }

    autowait(0.2f); // wait a bit longer for player to spawn

    m_soWeapon0.Set3DParameters(50.0f, 10.0f, 0.6f, 1.0f);
    m_soWeapon1.Set3DParameters(50.0f, 10.0f, 0.6f, 1.0f);

    // adjust falldown and step up values
    if (m_cfStepHeight==-1) {
      m_cfStepHeight = 2.0f;
    }

    // adjust falldown and step up values
    en_fStepUpHeight = m_cfStepHeight+0.01f;
    en_fStepDnHeight = m_cfFallHeight+0.01f;
    
    AddToMovers();
    m_aDefaultBodyPitch = GetDefaultBodyPitch();

    if (m_penMusicHolder==NULL) {
      m_penMusicHolder = _pNetwork->GetEntityWithName("MusicHolder", 0);
    }

    if (m_penMusicHolder == NULL) {
      WarningMessage("No music holder found, destroying friend\n");
      Destroy();
      return;
    }

    if (m_penMapMarker != NULL && !m_bTemplate) {
      m_penMapMarker->Teleport(GetPlacement(), FALSE);
      m_penMapMarker->SetParent(this);
    }

    if ((m_flBehaviourFlags&BF_FOLLOW_PLAYER)) {
      m_penPlayer = FindClosestPlayer();
    }

    wait() {
      on (EBegin) : {
        call MainLoop();
        resume;
      }
      on (EStart) : {
        resume;
      }

      on (ETrigger eTrigger) : {
        resume;
      }

      /*on (EEnterVehicle eEnterVehicle) : {
        if (m_penVehicle == NULL) {
          EnterVehicle(eEnterVehicle.penVehicle, eEnterVehicle.bShooter);
        }
        resume;
      }

      on (ELeaveVehicle eLeave) : {
        if (m_penVehicle != NULL) {
          // TODO: correct placement
          LeaveVehicle(eLeave.bPositionSpecified ? CPlacement3D(eLeave.vPosition, eLeave.aRotation) : m_penVehicle->GetPlacement(),
            eLeave.bKillPlayer, FALSE);
        }
        resume;
      }


      on (EMemoryMissionStart) : {
        if (m_bHideInMemory) {
          ForceFullStop();
          m_bHidden = TRUE;
          SetCollisionFlags(ECF_IMMATERIAL);
          SwitchToEditorModel();
        }
        resume;
      }*/

      on (EFriendChange eFriendChange) : {
        ChangeFriend(eFriendChange.penFriendManager);
        resume;
      }

      /*on (EMemoryMissionEnd) : {
        // show
        if (m_bHideInMemory) {
          m_bHidden = FALSE;
          SetCollisionFlags(ECF_MODEL);
          SwitchToModel();
        }
        resume;
      }*/

      on (EDeath eDeath) : {
        jump Death(eDeath);
        stop;
      }

      // silent destroy
      on (EEnd) : {

        if (_bWorldEditorApp) {
          CPrintF("Friend EEnd - %s\n", GetName());
        }

        Destroy();
        stop;
      }
    }
    return;
  }
};

