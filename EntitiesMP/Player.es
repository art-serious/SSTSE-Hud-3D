401
%{

#include "StdH.h"
#include "GameMP/SEColors.h"

#include <Engine/Build.h>
#include <Engine/Network/Network.h>
#include <locale.h>

#include "ModelsMP/Player/SeriousSam/Player.h"
#include "ModelsMP/Player/SeriousSam/Body.h"
#include "ModelsMP/Player/SeriousSam/Head.h"
#include <math.h>
#include "EntitiesMP/PlayerMarker.h"
#include "EntitiesMP/PlayerWeapons.h"
#include "EntitiesMP/PlayerAnimator.h"
#include "EntitiesMP/PlayerView.h"
#include "EntitiesMP/MovingBrush.h"
#include "EntitiesMP/Switch.h"
#include "EntitiesMP/MessageHolder.h"
#include "EntitiesMP/Camera.h"
#include "EntitiesMP/WorldLink.h"
#include "EntitiesMP/HealthItem.h"
#include "EntitiesMP/ArmorItem.h"
#include "EntitiesMP/WeaponItem.h"
#include "EntitiesMP/AmmoItem.h"
#include "EntitiesMP/PowerUpItem.h"
#include "EntitiesMP/MessageItem.h"
#include "EntitiesMP/AmmoPack.h"
#include "EntitiesMP/KeyItem.h"
#include "EntitiesMP/MusicHolder.h"
#include "EntitiesMP/EnemyBase.h"
#include "EntitiesMP/EnemyCounter.h"
#include "EntitiesMP/PlayerActionMarker.h"
#include "EntitiesMP/BasicEffects.h"
#include "EntitiesMP/BackgroundViewer.h"
#include "EntitiesMP/WorldSettingsController.h"
#include "EntitiesMP/ScrollHolder.h"
#include "EntitiesMP/TextFXHolder.h"
#include "EntitiesMP/SeriousBomb.h"
#include "EntitiesMP/CreditsHolder.h"
#include "EntitiesMP/HudPicHolder.h"
#include "EntitiesMP/EnemySpawner.h"
#include "EntitiesMP/EnemyBase.h"

#include "EntitiesMP/Shop.h"
#include "EntitiesMP/MoneyItem.h"
#include "EntitiesMP/ShieldItem.h"

// 3D HUD *****************************************************************************************
#include "Models/Interface/H3D_Base.h"
#include "Models/Interface/SHOP_BASE.h"
// END 3D HUD *************************************************************************************

extern void JumpFromBouncer(CEntity *penToBounce, CEntity *penBouncer);
// from game
#define GRV_SHOWEXTRAS  (1L<<0)   // add extra stuff like console, weapon, pause

#define GENDER_MALE     0
#define GENDER_FEMALE   1
#define GENDEROFFSET    100   // sound components for genders are offset by this value

%}

enum PlayerViewType {
  0 PVT_PLAYEREYES      "",
  1 PVT_PLAYERAUTOVIEW  "",
  2 PVT_SCENECAMERA     "",
  3 PVT_3RDPERSONVIEW   "",
};

enum PlayerState {
  0 PST_STAND     "",
  1 PST_CROUCH    "",
  2 PST_SWIM      "",
  3 PST_DIVE      "",
  4 PST_FALL      "",
};

// event for starting cinematic camera sequence
event ECameraStart {
  CEntityPointer penCamera,   // the camera
};

// event for ending cinematic camera sequence
event ECameraStop {
  CEntityPointer penCamera,   // the camera
};


// sent when needs to rebirth
event ERebirth {
};

// sent when player was disconnected from game
event EDisconnected {
};

// starts automatic player actions
event EAutoAction {
  CEntityPointer penFirstMarker,
};


event EShopEntered {
  CEntityPointer penShop,
};

%{
extern void DrawHUD( const CPlayer *penPlayerCurrent, CDrawPort *pdpCurrent/*, BOOL bSnooping, const CPlayer *penPlayerOwner*/);
extern void InitHUD(void);
extern void EndHUD(void);

static CTimerValue _tvProbingLast;

// used to render certain entities only for certain players (like picked items, etc.)
extern ULONG _ulPlayerRenderingMask = 0;

// temporary BOOL used to discard calculating of 3rd view when calculating absolute view placement
BOOL _bDiscard3rdView=FALSE;

#define NAME name

const FLOAT _fBlowUpAmmount = 70.0f;


// computer message adding flags
#define CMF_READ       (1L<<0)
#define CMF_ANALYZE    (1L<<1)

struct MarkerDistance {
public:
  FLOAT md_fMinD;
  CPlayerMarker *md_ppm;
  void Clear(void);
};

// export current player projection
CAnyProjection3D prPlayerProjection;


int qsort_CompareMarkerDistance(const void *pv0, const void *pv1)
{
  MarkerDistance &md0 = *(MarkerDistance*)pv0;
  MarkerDistance &md1 = *(MarkerDistance*)pv1;
  if(      md0.md_fMinD<md1.md_fMinD) return +1;
  else if( md0.md_fMinD>md1.md_fMinD) return -1;
  else                                return  0;
}

static inline FLOAT IntensityAtDistance( FLOAT fFallOff, FLOAT fHotSpot, FLOAT fDistance)
{
  // intensity is zero if further than fall-off range
  if( fDistance>fFallOff) return 0.0f;
  // intensity is maximum if closer than hot-spot range
  if( fDistance<fHotSpot) return 1.0f;
  // interpolate if between fall-off and hot-spot range
  return (fFallOff-fDistance)/(fFallOff-fHotSpot);
}

static CTString MakeEmptyString(INDEX ctLen, char ch=' ')
{
  char ach[2];
  ach[0] = ch;
  ach[1] = 0;
  CTString strSpaces;
  for (INDEX i=0; i<ctLen; i++) {
    strSpaces+=ach;
  }
  return strSpaces;
}

// take a two line string and align into one line of minimum given length
static _ctAlignWidth = 20;
static CTString AlignString(const CTString &strOrg)
{
  // split into two lines
  CTString strL = strOrg;
  strL.OnlyFirstLine();
  CTString strR = strOrg;
  strR.RemovePrefix(strL);
  strR.DeleteChar(0);
  
  // get their lengths
  INDEX iLenL = strL.LengthNaked();
  INDEX iLenR = strR.LengthNaked();

  // find number of spaces to insert
  INDEX ctSpaces = _ctAlignWidth-(iLenL+iLenR);
  if (ctSpaces<1) {
    ctSpaces=1;
  }

  // make aligned string
  return strL+MakeEmptyString(ctSpaces)+strR;
}

static CTString CenterString(const CTString &str)
{
  INDEX ctSpaces = (_ctAlignWidth-str.LengthNaked())/2;
  if (ctSpaces<0) {
    ctSpaces=0;
  }
  return MakeEmptyString(ctSpaces)+str;
}

static CTString PadStringRight(const CTString &str, INDEX iLen)
{
  INDEX ctSpaces = iLen-str.LengthNaked();
  if (ctSpaces<0) {
    ctSpaces=0;
  }
  return str+MakeEmptyString(ctSpaces);
}

static CTString PadStringLeft(const CTString &str, INDEX iLen)
{
  INDEX ctSpaces = iLen-str.LengthNaked();
  if (ctSpaces<0) {
    ctSpaces=0;
  }
  return MakeEmptyString(ctSpaces)+str;
}

static void KillAllEnemies(CEntity *penKiller)
{
  // for each entity in the world
  {FOREACHINDYNAMICCONTAINER(penKiller->GetWorld()->wo_cenEntities, CEntity, iten) {
    CEntity *pen = iten;
    if (IsDerivedFromClass(pen, "Enemy Base") && !IsOfClass(pen, "Devil")) {
      CEnemyBase *penEnemy = (CEnemyBase *)pen;
      if (penEnemy->m_penEnemy==NULL) {
        continue;
      }
      penKiller->InflictDirectDamage(pen, penKiller, DMT_BULLET, 
        penEnemy->GetHealth()+1, pen->GetPlacement().pl_PositionVector, FLOAT3D(0,1,0));
    }
  }}
}


#define HEADING_MAX      45.0f
#define PITCH_MAX        90.0f
#define BANKING_MAX      45.0f

// player flags
#define PLF_INITIALIZED           (1UL<<0)   // set when player entity is ready to function
#define PLF_VIEWROTATIONCHANGED   (1UL<<1)   // for adjusting view rotation separately from legs
#define PLF_JUMPALLOWED           (1UL<<2)   // if jumping is allowed
#define PLF_SYNCWEAPON            (1UL<<3)   // weapon model needs to be synchronized before rendering
#define PLF_AUTOMOVEMENTS         (1UL<<4)   // complete automatic control of movements
#define PLF_DONTRENDER            (1UL<<5)   // don't render view (used at end of level)
#define PLF_CHANGINGLEVEL         (1UL<<6)   // mark that we next are to appear at start of new level
#define PLF_APPLIEDACTION         (1UL<<7)   // used to detect when player is not connected
#define PLF_NOTCONNECTED          (1UL<<8)   // set if the player is not connected
#define PLF_LEVELSTARTED          (1UL<<9)   // marks that level start time was recorded
#define PLF_ISZOOMING             (1UL<<10)  // marks that player is zoomed in with the sniper
#define PLF_RESPAWNINPLACE        (1UL<<11)  // don't move to marker when respawning (for current death only)

// defines representing flags used to fill player buttoned actions
#define PLACT_FIRE                (1L<<0)
#define PLACT_RELOAD              (1L<<1)
#define PLACT_WEAPON_NEXT         (1L<<2)
#define PLACT_WEAPON_PREV         (1L<<3)
#define PLACT_WEAPON_FLIP         (1L<<4)
#define PLACT_USE                 (1L<<5)
#define PLACT_COMPUTER            (1L<<6)
#define PLACT_3RD_PERSON_VIEW     (1L<<7)
#define PLACT_CENTER_VIEW         (1L<<8)
#define PLACT_USE_HELD            (1L<<9)
#define PLACT_SNIPER_ZOOMIN       (1L<<10)
#define PLACT_SNIPER_ZOOMOUT      (1L<<11)
#define PLACT_SNIPER_USE          (1L<<12)
#define PLACT_FIREBOMB            (1L<<13)
#define PLACT_SHOW_TAB_INFO       (1L<<14)
#define PLACT_DROP_MONEY          (1L<<15)
#define PLACT_SELECT_WEAPON_SHIFT (16)
#define PLACT_SELECT_WEAPON_MASK  (0x1FL<<PLACT_SELECT_WEAPON_SHIFT)
                                     
#define MAX_WEAPONS 30

#define PICKEDREPORT_TIME   (2.0f)  // how long (picked-up) message stays on screen

// is player spying another player
//extern TIME _tmSnoopingStarted;
//extern CEntity *_penTargeting;

struct PlayerControls {
  FLOAT3D aRotation;
  FLOAT3D aViewRotation;
  FLOAT3D vTranslation;

  BOOL bMoveForward;
  BOOL bMoveBackward;
  BOOL bMoveLeft;
  BOOL bMoveRight;
  BOOL bMoveUp;
  BOOL bMoveDown;

  BOOL bTurnLeft;
  BOOL bTurnRight;
  BOOL bTurnUp;
  BOOL bTurnDown;
  BOOL bTurnBankingLeft;
  BOOL bTurnBankingRight;
  BOOL bCenterView;

  BOOL bLookLeft;
  BOOL bLookRight;
  BOOL bLookUp;
  BOOL bLookDown;
  BOOL bLookBankingLeft;
  BOOL bLookBankingRight;

  BOOL bSelectWeapon[MAX_WEAPONS+1];
  BOOL bWeaponNext;
  BOOL bWeaponPrev;
  BOOL bWeaponFlip;
  
  BOOL bWalk;
  BOOL bStrafe;
  BOOL bFire;
  BOOL bShowTabInfo;
  BOOL bDropMoney;
  BOOL bReload;
  BOOL bUse;
  BOOL bComputer;
  BOOL bUseOrComputer;
  BOOL bUseOrComputerLast;  // for internal use
  BOOL b3rdPersonView;

  BOOL bSniperZoomIn;
  BOOL bSniperZoomOut;
  BOOL bFireBomb;
};

static struct PlayerControls pctlCurrent;

// cheats
static INDEX cht_iGoToMarker = -1;
static INDEX cht_bKillAll    = FALSE;
static INDEX cht_bGiveAll    = FALSE;
static INDEX cht_bOpen       = FALSE;
static INDEX cht_bAllMessages= FALSE;
static INDEX cht_bRefresh    = FALSE;
extern INDEX cht_bGod        = FALSE;
extern INDEX cht_bFly        = FALSE;
extern INDEX cht_bGhost      = FALSE;
extern INDEX cht_bInvisible  = FALSE;
extern FLOAT cht_fTranslationMultiplier = 1.0f;
extern FLOAT cht_fMaxShield  = 0.0f;
extern INDEX cht_bEnable     = 0;   

// interface control
static INDEX hud_bShowAll	    = TRUE; // used internaly in menu/console
extern INDEX hud_bShowWeapon  = TRUE;
extern INDEX hud_bShowMessages = TRUE;
extern INDEX hud_bShowInfo    = TRUE;
extern INDEX hud_bShowLatency = FALSE;
extern INDEX hud_iShowPlayers = -1;   // auto
extern INDEX hud_iSortPlayers = -1;   // auto
extern FLOAT hud_fOpacity     = 0.9f;
extern FLOAT hud_fScaling     = 1.0f;
extern FLOAT hud_tmWeaponsOnScreen = 3.0f;
extern FLOAT hud_tmLatencySnapshot = 1.0f;
extern INDEX hud_bShowMatchInfo = TRUE;
extern INDEX _colHUD = 0x4C80BB00;

extern FLOAT plr_fBreathingStrength = 0.0f;
extern FLOAT plr_tmSnoopingTime;
extern INDEX cht_bKillFinalBoss = FALSE;
INDEX cht_bDebugFinalBoss = FALSE;
INDEX cht_bDumpFinalBossData = FALSE;
INDEX cht_bDebugFinalBossAnimations = FALSE;
INDEX cht_bDumpPlayerShading = FALSE;

extern FLOAT wpn_fRecoilSpeed[17]   = {0};
extern FLOAT wpn_fRecoilLimit[17]   = {0};
extern FLOAT wpn_fRecoilDampUp[17]  = {0};
extern FLOAT wpn_fRecoilDampDn[17]  = {0};
extern FLOAT wpn_fRecoilOffset[17]  = {0};
extern FLOAT wpn_fRecoilFactorP[17] = {0};
extern FLOAT wpn_fRecoilFactorZ[17] = {0};

// misc
static FLOAT plr_fAcceleration  = 100.0f;
static FLOAT plr_fDeceleration  = 60.0f;
static FLOAT plr_fSpeedForward  = 10.0f;
static FLOAT plr_fSpeedBackward = 10.0f;
static FLOAT plr_fSpeedSide     = 10.0f;
static FLOAT plr_fSpeedUp       = 11.0f;
static FLOAT plr_fViewHeightStand  = 1.9f;
static FLOAT plr_fViewHeightCrouch = 0.7f;
static FLOAT plr_fViewHeightSwim   = 0.4f;
static FLOAT plr_fViewHeightDive   = 0.0f;
extern FLOAT plr_fViewDampFactor        = 0.4f;
extern FLOAT plr_fViewDampLimitGroundUp = 0.1f;
extern FLOAT plr_fViewDampLimitGroundDn = 0.4f;
extern FLOAT plr_fViewDampLimitWater    = 0.1f;
static FLOAT plr_fFrontClipDistance = 0.25f;
static FLOAT plr_fFOV = 90.0f;
static FLOAT net_tmLatencyAvg;
extern INDEX plr_bRenderPicked = FALSE;
extern INDEX plr_bRenderPickedParticles = FALSE;
extern INDEX plr_bOnlySam = FALSE;
extern INDEX ent_bReportBrokenChains = FALSE;
extern FLOAT ent_tmMentalIn   = 0.5f;
extern FLOAT ent_tmMentalOut  = 0.75f;
extern FLOAT ent_tmMentalFade = 0.5f;

extern FLOAT gfx_fEnvParticlesDensity = 1.0f;
extern FLOAT gfx_fEnvParticlesRange = 1.0f;

// prediction control vars
extern FLOAT cli_fPredictPlayersRange = 0.0f;
extern FLOAT cli_fPredictItemsRange = 3.0f;
extern FLOAT cli_tmPredictFoe = 10.0f;
extern FLOAT cli_tmPredictAlly = 10.0f;
extern FLOAT cli_tmPredictEnemy  = 10.0f;

static FLOAT plr_fSwimSoundDelay = 0.8f;
static FLOAT plr_fDiveSoundDelay = 1.6f;
static FLOAT plr_fWalkSoundDelay = 0.5f;
static FLOAT plr_fRunSoundDelay  = 0.3f;

static FLOAT ctl_tmComputerDoubleClick = 0.5f; // double click delay for calling computer
static FLOAT _tmLastUseOrCompPressed = -10.0f;  // for computer doubleclick

// speeds for button rotation
static FLOAT ctl_fButtonRotationSpeedH = 300.0f;
static FLOAT ctl_fButtonRotationSpeedP = 150.0f;
static FLOAT ctl_fButtonRotationSpeedB = 150.0f;
// modifier for axis strafing
static FLOAT ctl_fAxisStrafingModifier = 1.0f;

// *3D HUD*****************************************************************************************
static FLOAT h3d_fH                    = (FLOAT)0;
static FLOAT h3d_fP                    = (FLOAT)0;
static FLOAT h3d_fB                    = (FLOAT)0;
static FLOAT h3d_fX                    = (FLOAT)0.05;
static FLOAT h3d_fY                    = (FLOAT)0.05;
static FLOAT h3d_fZ                    = (FLOAT)0.05;
static FLOAT h3d_fFOV                  = (FLOAT)75;
static FLOAT h3d_fClip                 = (FLOAT)1;
static INDEX h3d_iColor                = (INDEX)0x6CA0DB00;
static FLOAT h3d_fWpnInertFactor       = 0.05f;
static FLOAT h3d_fHUDInertFactor       = 0.035f;
static BOOL  h3d_bHudInertia           = TRUE;
static BOOL  h3d_bHudBobbing           = TRUE;
static BOOL  h3d_bShakingFromDamage    = TRUE;
static FLOAT h3d_fEnemyShowMaxHealth   = (FLOAT)-1;
static FLOAT h3d_OriginalAttachmentPositions[110];
static FLOAT h3d_fVerticalPlacementHUD = (FLOAT)0;
static BOOL  h3d_bRenderSurfaceAdd     = FALSE;

static INDEX dbg_strEnemySpawnerInfo   = 0;
static INDEX dbg_strEnemyBaseInfo      = 0;
// *END 3D HUD*************************************************************************************

// !=NULL if some player wants to call computer
DECL_DLL extern class CPlayer *cmp_ppenPlayer = NULL;
// !=NULL for rendering computer on secondary display in dualhead
DECL_DLL extern class CPlayer *cmp_ppenDHPlayer = NULL;
// set to update current message in background mode (for dualhead)
DECL_DLL extern BOOL cmp_bUpdateInBackground = FALSE;
// set for initial calling computer without rendering game
DECL_DLL extern BOOL cmp_bInitialStart = FALSE;

// game sets this for player hud and statistics and hiscore sound playing
DECL_DLL extern INDEX plr_iHiScore = 0.0f;

// these define address and size of player controls structure
DECL_DLL extern void *ctl_pvPlayerControls = &pctlCurrent;
DECL_DLL extern const SLONG ctl_slPlayerControlsSize = sizeof(pctlCurrent);

// called to compose action packet from current controls
DECL_DLL void ctl_ComposeActionPacket(const CPlayerCharacter &pc, CPlayerAction &paAction, BOOL bPreScan)
{
  // allow double axis controls
  paAction.pa_aRotation += paAction.pa_aViewRotation;

  CPlayerSettings *pps = (CPlayerSettings *)pc.pc_aubAppearance;
//  CPrintF("compose: prescan %d, x:%g\n", bPreScan, paAction.pa_aRotation(1));
  // if strafing
  if (pctlCurrent.bStrafe) {
    // move rotation left/right into translation left/right
    paAction.pa_vTranslation(1) = -paAction.pa_aRotation(1)*ctl_fAxisStrafingModifier;
    paAction.pa_aRotation(1) = 0;
  }
  // if centering view
  if (pctlCurrent.bCenterView) {
    // don't allow moving view up/down
    paAction.pa_aRotation(2) = 0;
  }

  // multiply axis actions with speed
  paAction.pa_vTranslation(1) *= plr_fSpeedSide;
  paAction.pa_vTranslation(2) *= plr_fSpeedUp;
  if (paAction.pa_vTranslation(3)<0) {
    paAction.pa_vTranslation(3) *= plr_fSpeedForward;
  } else {
    paAction.pa_vTranslation(3) *= plr_fSpeedBackward;
  }

  // find local player, if any
  CPlayer *penThis = NULL;
  INDEX ctPlayers = CEntity::GetMaxPlayers();
  for (INDEX iPlayer = 0; iPlayer<ctPlayers; iPlayer++) {
    CPlayer *pen=(CPlayer *)CEntity::GetPlayerEntity(iPlayer);
    if (pen!=NULL && pen->en_pcCharacter==pc) {
      penThis = pen;
      break;
    }
  }
  // if not found
  if (penThis==NULL) {
    // do nothing
    return;
  }
  // accumulate local rotation
  penThis->m_aLocalRotation    +=paAction.pa_aRotation;
  penThis->m_aLocalViewRotation+=paAction.pa_aViewRotation;
  penThis->m_vLocalTranslation +=paAction.pa_vTranslation;

  // if prescanning
  if (bPreScan) {
    // no button checking
    return;
  }

  // add button movement/rotation/look actions to the axis actions
  if(pctlCurrent.bMoveForward  ) paAction.pa_vTranslation(3) -= plr_fSpeedForward;
  if(pctlCurrent.bMoveBackward ) paAction.pa_vTranslation(3) += plr_fSpeedBackward;
  if(pctlCurrent.bMoveLeft  || pctlCurrent.bStrafe&&pctlCurrent.bTurnLeft) paAction.pa_vTranslation(1) -= plr_fSpeedSide;
  if(pctlCurrent.bMoveRight || pctlCurrent.bStrafe&&pctlCurrent.bTurnRight) paAction.pa_vTranslation(1) += plr_fSpeedSide;
  if(pctlCurrent.bMoveUp       ) paAction.pa_vTranslation(2) += plr_fSpeedUp;
  if(pctlCurrent.bMoveDown     ) paAction.pa_vTranslation(2) -= plr_fSpeedUp;

  const FLOAT fQuantum = _pTimer->TickQuantum;
  if(pctlCurrent.bTurnLeft  && !pctlCurrent.bStrafe) penThis->m_aLocalRotation(1) += ctl_fButtonRotationSpeedH*fQuantum;
  if(pctlCurrent.bTurnRight && !pctlCurrent.bStrafe) penThis->m_aLocalRotation(1) -= ctl_fButtonRotationSpeedH*fQuantum;
  if(pctlCurrent.bTurnUp           ) penThis->m_aLocalRotation(2) += ctl_fButtonRotationSpeedP*fQuantum;
  if(pctlCurrent.bTurnDown         ) penThis->m_aLocalRotation(2) -= ctl_fButtonRotationSpeedP*fQuantum;
  if(pctlCurrent.bTurnBankingLeft  ) penThis->m_aLocalRotation(3) += ctl_fButtonRotationSpeedB*fQuantum;
  if(pctlCurrent.bTurnBankingRight ) penThis->m_aLocalRotation(3) -= ctl_fButtonRotationSpeedB*fQuantum;

  if(pctlCurrent.bLookLeft         ) penThis->m_aLocalViewRotation(1) += ctl_fButtonRotationSpeedH*fQuantum;
  if(pctlCurrent.bLookRight        ) penThis->m_aLocalViewRotation(1) -= ctl_fButtonRotationSpeedH*fQuantum;
  if(pctlCurrent.bLookUp           ) penThis->m_aLocalViewRotation(2) += ctl_fButtonRotationSpeedP*fQuantum;
  if(pctlCurrent.bLookDown         ) penThis->m_aLocalViewRotation(2) -= ctl_fButtonRotationSpeedP*fQuantum;
  if(pctlCurrent.bLookBankingLeft  ) penThis->m_aLocalViewRotation(3) += ctl_fButtonRotationSpeedB*fQuantum;
  if(pctlCurrent.bLookBankingRight ) penThis->m_aLocalViewRotation(3) -= ctl_fButtonRotationSpeedB*fQuantum;

  // use current accumulated rotation
  paAction.pa_aRotation     = penThis->m_aLocalRotation;
  paAction.pa_aViewRotation = penThis->m_aLocalViewRotation;
  //paAction.pa_vTranslation  = penThis->m_vLocalTranslation;

  // if walking
  if(pctlCurrent.bWalk) {
    // make forward/backward and sidestep speeds slower
    paAction.pa_vTranslation(3) /= 2.0f;
    paAction.pa_vTranslation(1) /= 2.0f;
  }
  
  // reset all button actions
  paAction.pa_ulButtons = 0;

  // set weapon selection bits
  for(INDEX i=1; i<MAX_WEAPONS; i++) {
    if(pctlCurrent.bSelectWeapon[i]) {
      paAction.pa_ulButtons = i<<PLACT_SELECT_WEAPON_SHIFT;
      break;
    }
  }
  // set button pressed flags
  if(pctlCurrent.bWeaponNext) paAction.pa_ulButtons |= PLACT_WEAPON_NEXT;
  if(pctlCurrent.bWeaponPrev) paAction.pa_ulButtons |= PLACT_WEAPON_PREV;
  if(pctlCurrent.bWeaponFlip) paAction.pa_ulButtons |= PLACT_WEAPON_FLIP;
  if(pctlCurrent.bFire)       paAction.pa_ulButtons |= PLACT_FIRE;
  if(pctlCurrent.bReload)     paAction.pa_ulButtons |= PLACT_RELOAD;
  if(pctlCurrent.bUse)        paAction.pa_ulButtons |= PLACT_USE|PLACT_USE_HELD|PLACT_SNIPER_USE;
  if(pctlCurrent.bComputer)      paAction.pa_ulButtons |= PLACT_COMPUTER;
  if(pctlCurrent.b3rdPersonView) paAction.pa_ulButtons |= PLACT_3RD_PERSON_VIEW;
  if(pctlCurrent.bCenterView)    paAction.pa_ulButtons |= PLACT_CENTER_VIEW;
  // is 'use' being held?
  if(pctlCurrent.bUseOrComputer) paAction.pa_ulButtons |= PLACT_USE_HELD|PLACT_SNIPER_USE;
  if(pctlCurrent.bSniperZoomIn)  paAction.pa_ulButtons |= PLACT_SNIPER_ZOOMIN;
  if(pctlCurrent.bSniperZoomOut) paAction.pa_ulButtons |= PLACT_SNIPER_ZOOMOUT;
  if(pctlCurrent.bFireBomb)      paAction.pa_ulButtons |= PLACT_FIREBOMB;
  if(pctlCurrent.bShowTabInfo)   paAction.pa_ulButtons |= PLACT_SHOW_TAB_INFO;
  if(pctlCurrent.bDropMoney)     paAction.pa_ulButtons |= PLACT_DROP_MONEY;

  // if userorcomp just pressed
  if(pctlCurrent.bUseOrComputer && !pctlCurrent.bUseOrComputerLast) {
    // if double-click is off
    if (ctl_tmComputerDoubleClick==0 || (pps->ps_ulFlags&PSF_COMPSINGLECLICK)) {
      // press both
      paAction.pa_ulButtons |= PLACT_USE|PLACT_COMPUTER;
    // if double-click is on
    } else {
      // if double click
      if (_pTimer->GetRealTimeTick()<=_tmLastUseOrCompPressed+ctl_tmComputerDoubleClick) {
        // computer pressed
        paAction.pa_ulButtons |= PLACT_COMPUTER;
      // if single click
      } else {
        // use pressed
        paAction.pa_ulButtons |= PLACT_USE;
      }
    }
    _tmLastUseOrCompPressed = _pTimer->GetRealTimeTick();
  }
  // remember old userorcomp pressed state
  pctlCurrent.bUseOrComputerLast = pctlCurrent.bUseOrComputer;
};

void CPlayer_Precache(void)
{
  CDLLEntityClass *pdec = &CPlayer_DLLClass;

  // precache view
  extern void CPlayerView_Precache(void);
  CPlayerView_Precache();

  // precache all player sounds
  pdec->PrecacheSound(SOUND_WATER_ENTER        );
  pdec->PrecacheSound(SOUND_WATER_LEAVE        );
  pdec->PrecacheSound(SOUND_WALK_L             );
  pdec->PrecacheSound(SOUND_WALK_R             );
  pdec->PrecacheSound(SOUND_WALK_SAND_L        );
  pdec->PrecacheSound(SOUND_WALK_SAND_R        );
  pdec->PrecacheSound(SOUND_SWIM_L             );
  pdec->PrecacheSound(SOUND_SWIM_R             );
  pdec->PrecacheSound(SOUND_DIVE_L             );
  pdec->PrecacheSound(SOUND_DIVE_R             );
  pdec->PrecacheSound(SOUND_DIVEIN             );
  pdec->PrecacheSound(SOUND_DIVEOUT            );
  pdec->PrecacheSound(SOUND_DROWN              );
  pdec->PrecacheSound(SOUND_INHALE0            );
  pdec->PrecacheSound(SOUND_JUMP               );
  pdec->PrecacheSound(SOUND_LAND               );
  pdec->PrecacheSound(SOUND_WOUNDWEAK          );
  pdec->PrecacheSound(SOUND_WOUNDMEDIUM        );
  pdec->PrecacheSound(SOUND_WOUNDSTRONG        );
  pdec->PrecacheSound(SOUND_WOUNDWATER         );
  pdec->PrecacheSound(SOUND_DEATH              );
  pdec->PrecacheSound(SOUND_DEATHWATER         );
  pdec->PrecacheSound(SOUND_WATERAMBIENT       );
  pdec->PrecacheSound(SOUND_WATERBUBBLES       );
  pdec->PrecacheSound(SOUND_WATERWALK_L        );
  pdec->PrecacheSound(SOUND_WATERWALK_R        );
  pdec->PrecacheSound(SOUND_INHALE1            );
  pdec->PrecacheSound(SOUND_INHALE2            );
  pdec->PrecacheSound(SOUND_INFO               );
  pdec->PrecacheSound(SOUND_WALK_GRASS_L       );
  pdec->PrecacheSound(SOUND_WALK_GRASS_R       );
  pdec->PrecacheSound(SOUND_WALK_WOOD_L        );
  pdec->PrecacheSound(SOUND_WALK_WOOD_R        );
  pdec->PrecacheSound(SOUND_WALK_SNOW_L        );
  pdec->PrecacheSound(SOUND_WALK_SNOW_R        );
//pdec->PrecacheSound(SOUND_HIGHSCORE          );
  pdec->PrecacheSound(SOUND_SNIPER_ZOOM        );
  pdec->PrecacheSound(SOUND_SNIPER_QZOOM       );
  pdec->PrecacheSound(SOUND_SILENCE            );
  pdec->PrecacheSound(SOUND_POWERUP_BEEP       );

  pdec->PrecacheSound(SOUND_F_WATER_ENTER        );
  pdec->PrecacheSound(SOUND_F_WATER_LEAVE        );
  pdec->PrecacheSound(SOUND_F_WALK_L             );
  pdec->PrecacheSound(SOUND_F_WALK_R             );
  pdec->PrecacheSound(SOUND_F_WALK_SAND_L        );
  pdec->PrecacheSound(SOUND_F_WALK_SAND_R        );
  pdec->PrecacheSound(SOUND_F_SWIM_L             );
  pdec->PrecacheSound(SOUND_F_SWIM_R             );
  pdec->PrecacheSound(SOUND_F_DIVE_L             );
  pdec->PrecacheSound(SOUND_F_DIVE_R             );
  pdec->PrecacheSound(SOUND_F_DIVEIN             );
  pdec->PrecacheSound(SOUND_F_DIVEOUT            );
  pdec->PrecacheSound(SOUND_F_DROWN              );
  pdec->PrecacheSound(SOUND_F_INHALE0            );
  pdec->PrecacheSound(SOUND_F_JUMP               );
  pdec->PrecacheSound(SOUND_F_LAND               );
  pdec->PrecacheSound(SOUND_F_WOUNDWEAK          );
  pdec->PrecacheSound(SOUND_F_WOUNDMEDIUM        );
  pdec->PrecacheSound(SOUND_F_WOUNDSTRONG        );
  pdec->PrecacheSound(SOUND_F_WOUNDWATER         );
  pdec->PrecacheSound(SOUND_F_DEATH              );
  pdec->PrecacheSound(SOUND_F_DEATHWATER         );
  pdec->PrecacheSound(SOUND_F_WATERWALK_L        );
  pdec->PrecacheSound(SOUND_F_WATERWALK_R        );
  pdec->PrecacheSound(SOUND_F_INHALE1            );
  pdec->PrecacheSound(SOUND_F_INHALE2            );
  pdec->PrecacheSound(SOUND_F_WALK_GRASS_L       );
  pdec->PrecacheSound(SOUND_F_WALK_GRASS_R       );
  pdec->PrecacheSound(SOUND_F_WALK_WOOD_L        );
  pdec->PrecacheSound(SOUND_F_WALK_WOOD_R        );
  pdec->PrecacheSound(SOUND_F_WALK_SNOW_L        );
  pdec->PrecacheSound(SOUND_F_WALK_SNOW_R        );
//pdec->PrecacheSound(SOUND_F_HIGHSCORE          );
  pdec->PrecacheSound(SOUND_BLOWUP               );

  pdec->PrecacheClass(CLASS_BASIC_EFFECT, BET_TELEPORT);
  pdec->PrecacheClass(CLASS_SERIOUSBOMB);

  pdec->PrecacheModel(MODEL_H3D_BASE);
  pdec->PrecacheModel(MODEL_FLESH);
  pdec->PrecacheModel(MODEL_FLESH_APPLE);
  pdec->PrecacheModel(MODEL_FLESH_BANANA);
  pdec->PrecacheModel(MODEL_FLESH_BURGER);

  pdec->PrecacheTexture(TEXTURE_H3D_ANI);
  pdec->PrecacheTexture(TEXTURE_FLESH_RED);
  pdec->PrecacheTexture(TEXTURE_FLESH_GREEN);
  pdec->PrecacheTexture(TEXTURE_FLESH_APPLE); 
  pdec->PrecacheTexture(TEXTURE_FLESH_BANANA);
  pdec->PrecacheTexture(TEXTURE_FLESH_BURGER);
  pdec->PrecacheTexture(TEXTURE_FLESH_LOLLY); 
  pdec->PrecacheTexture(TEXTURE_FLESH_ORANGE); 

  pdec->PrecacheClass(CLASS_BASIC_EFFECT, BET_BLOODSPILL);
  pdec->PrecacheClass(CLASS_BASIC_EFFECT, BET_BLOODSTAIN);
  pdec->PrecacheClass(CLASS_BASIC_EFFECT, BET_BLOODSTAINGROW);
  pdec->PrecacheClass(CLASS_BASIC_EFFECT, BET_BLOODEXPLODE);

  // 3D HUD ***************************************************************************************
  pdec->PrecacheModel(MODEL_H3D_BASE     );
  pdec->PrecacheModel(MODEL_H3D_4X4      );
  pdec->PrecacheModel(MODEL_H3D_1X1      );
  pdec->PrecacheModel(MODEL_H3D_06X06    );
  pdec->PrecacheModel(MODEL_H3D_07X07    );

  pdec->PrecacheTexture(TEXTURE_H3D_BASE ); 
  pdec->PrecacheTexture(TEXTURE_H3D_ANI  );
  
  pdec->PrecacheModel(MODEL_SHOP_MENU_BASE);
  pdec->PrecacheModel(MODEL_SHOP_MENU_LONG);
  pdec->PrecacheModel(MODEL_SHOP_MENU_MEDIUM);

  pdec->PrecacheTexture(TEXTURE_SHOP_BRD   );
  pdec->PrecacheTexture(TEXTURE_SHOP_ITM   );
  pdec->PrecacheTexture(TEXTURE_SHOP_BGD   );
  pdec->PrecacheTexture(TEXTURE_SHOP_TIP   );
  pdec->PrecacheTexture(TEXTURE_SHOP_COST  );
  pdec->PrecacheTexture(TEXTURE_SHOP_VALUE );

  pdec->PrecacheSound(SOUND_SHOP_BUY       );
  pdec->PrecacheSound(SOUND_SHOP_ERROR     );

  pdec->PrecacheModel(MODEL_BAG            );
  pdec->PrecacheTexture(TEXTURE_BAG        );

  pdec->PrecacheSound(SOUND_SHIELD_HIT     );
  pdec->PrecacheSound(SOUND_SHIELD_CHARGE  );
  pdec->PrecacheSound(SOUND_SHIELD_BREAK   );
  pdec->PrecacheSound(SOUND_SHIELD_CHARGED );
  // END 3D HUD ***********************************************************************************
}


void CPlayer_OnInitClass(void)
{
// *3D HUD*****************************************************************************************
  _pShell->DeclareSymbol("persistent user FLOAT h3d_fH;",                    &h3d_fH);
  _pShell->DeclareSymbol("persistent user FLOAT h3d_fP;",                    &h3d_fP);
  _pShell->DeclareSymbol("persistent user FLOAT h3d_fB;",                    &h3d_fB);
  _pShell->DeclareSymbol("persistent user FLOAT h3d_fX;",                    &h3d_fX);
  _pShell->DeclareSymbol("persistent user FLOAT h3d_fY;",                    &h3d_fY);
  _pShell->DeclareSymbol("persistent user FLOAT h3d_fZ;",                    &h3d_fZ);
  _pShell->DeclareSymbol("persistent user FLOAT h3d_fFOV;",                  &h3d_fFOV);
  _pShell->DeclareSymbol("persistent user FLOAT h3d_fClip;",                 &h3d_fClip);
  _pShell->DeclareSymbol("persistent user INDEX h3d_iColor;",                &h3d_iColor);
  _pShell->DeclareSymbol("persistent user FLOAT h3d_fWpnInertFactor;",       &h3d_fWpnInertFactor);
  _pShell->DeclareSymbol("persistent user FLOAT h3d_fHUDInertFactor;",       &h3d_fHUDInertFactor);
  _pShell->DeclareSymbol("persistent user INDEX h3d_bHudInertia;",           &h3d_bHudInertia);
  _pShell->DeclareSymbol("persistent user INDEX h3d_bHudBobbing;",           &h3d_bHudBobbing);
  _pShell->DeclareSymbol("persistent user INDEX h3d_bShakingFromDamage;",    &h3d_bShakingFromDamage);
  _pShell->DeclareSymbol("persistent user FLOAT h3d_fEnemyShowMaxHealth;",   &h3d_fEnemyShowMaxHealth);
  _pShell->DeclareSymbol("persistent user FLOAT h3d_fVerticalPlacementHUD;", &h3d_fVerticalPlacementHUD);
  _pShell->DeclareSymbol("persistent user INDEX h3d_bRenderSurfaceAdd;",     &h3d_bRenderSurfaceAdd);
// *END 3D HUD*************************************************************************************

  // clear current player controls
  memset(&pctlCurrent, 0, sizeof(pctlCurrent));
  // declare player control variables
  _pShell->DeclareSymbol("user INDEX ctl_bMoveForward;",  &pctlCurrent.bMoveForward);
  _pShell->DeclareSymbol("user INDEX ctl_bMoveBackward;", &pctlCurrent.bMoveBackward);
  _pShell->DeclareSymbol("user INDEX ctl_bMoveLeft;",     &pctlCurrent.bMoveLeft);
  _pShell->DeclareSymbol("user INDEX ctl_bMoveRight;",    &pctlCurrent.bMoveRight);
  _pShell->DeclareSymbol("user INDEX ctl_bMoveUp;",       &pctlCurrent.bMoveUp);
  _pShell->DeclareSymbol("user INDEX ctl_bMoveDown;",     &pctlCurrent.bMoveDown);
  _pShell->DeclareSymbol("user INDEX ctl_bTurnLeft;",         &pctlCurrent.bTurnLeft);
  _pShell->DeclareSymbol("user INDEX ctl_bTurnRight;",        &pctlCurrent.bTurnRight);
  _pShell->DeclareSymbol("user INDEX ctl_bTurnUp;",           &pctlCurrent.bTurnUp);
  _pShell->DeclareSymbol("user INDEX ctl_bTurnDown;",         &pctlCurrent.bTurnDown);
  _pShell->DeclareSymbol("user INDEX ctl_bTurnBankingLeft;",  &pctlCurrent.bTurnBankingLeft);
  _pShell->DeclareSymbol("user INDEX ctl_bTurnBankingRight;", &pctlCurrent.bTurnBankingRight);
  _pShell->DeclareSymbol("user INDEX ctl_bCenterView;",       &pctlCurrent.bCenterView);
  _pShell->DeclareSymbol("user INDEX ctl_bLookLeft;",         &pctlCurrent.bLookLeft);
  _pShell->DeclareSymbol("user INDEX ctl_bLookRight;",        &pctlCurrent.bLookRight);
  _pShell->DeclareSymbol("user INDEX ctl_bLookUp;",           &pctlCurrent.bLookUp);
  _pShell->DeclareSymbol("user INDEX ctl_bLookDown;",         &pctlCurrent.bLookDown);
  _pShell->DeclareSymbol("user INDEX ctl_bLookBankingLeft;",  &pctlCurrent.bLookBankingLeft);
  _pShell->DeclareSymbol("user INDEX ctl_bLookBankingRight;", &pctlCurrent.bLookBankingRight );
  _pShell->DeclareSymbol("user INDEX ctl_bWalk;",           &pctlCurrent.bWalk);
  _pShell->DeclareSymbol("user INDEX ctl_bStrafe;",         &pctlCurrent.bStrafe);
  _pShell->DeclareSymbol("user INDEX ctl_bFire;",           &pctlCurrent.bFire);
  _pShell->DeclareSymbol("user INDEX ctl_bReload;",         &pctlCurrent.bReload);
  _pShell->DeclareSymbol("user INDEX ctl_bUse;",            &pctlCurrent.bUse);
  _pShell->DeclareSymbol("user INDEX ctl_bComputer;",       &pctlCurrent.bComputer);
  _pShell->DeclareSymbol("user INDEX ctl_bUseOrComputer;",  &pctlCurrent.bUseOrComputer);
  _pShell->DeclareSymbol("user INDEX ctl_b3rdPersonView;",  &pctlCurrent.b3rdPersonView);
  _pShell->DeclareSymbol("user INDEX ctl_bWeaponNext;",         &pctlCurrent.bWeaponNext);
  _pShell->DeclareSymbol("user INDEX ctl_bWeaponPrev;",         &pctlCurrent.bWeaponPrev);
  _pShell->DeclareSymbol("user INDEX ctl_bWeaponFlip;",         &pctlCurrent.bWeaponFlip);
  _pShell->DeclareSymbol("user INDEX ctl_bSelectWeapon[30+1];", &pctlCurrent.bSelectWeapon);
  _pShell->DeclareSymbol("persistent user FLOAT ctl_tmComputerDoubleClick;", &ctl_tmComputerDoubleClick);
  _pShell->DeclareSymbol("persistent user FLOAT ctl_fButtonRotationSpeedH;", &ctl_fButtonRotationSpeedH);
  _pShell->DeclareSymbol("persistent user FLOAT ctl_fButtonRotationSpeedP;", &ctl_fButtonRotationSpeedP);
  _pShell->DeclareSymbol("persistent user FLOAT ctl_fButtonRotationSpeedB;", &ctl_fButtonRotationSpeedB);
  _pShell->DeclareSymbol("persistent user FLOAT ctl_fAxisStrafingModifier;", &ctl_fAxisStrafingModifier);
  //new
  _pShell->DeclareSymbol("user INDEX ctl_bSniperZoomIn;",         &pctlCurrent.bSniperZoomIn);
  _pShell->DeclareSymbol("user INDEX ctl_bSniperZoomOut;",        &pctlCurrent.bSniperZoomOut);
  _pShell->DeclareSymbol("user INDEX ctl_bFireBomb;",             &pctlCurrent.bFireBomb);
  _pShell->DeclareSymbol("user INDEX ctl_bShowTabInfo;",          &pctlCurrent.bShowTabInfo);
  _pShell->DeclareSymbol("user INDEX ctl_bDropMoney;",            &pctlCurrent.bDropMoney);

  _pShell->DeclareSymbol("user FLOAT plr_fSwimSoundDelay;", &plr_fSwimSoundDelay);
  _pShell->DeclareSymbol("user FLOAT plr_fDiveSoundDelay;", &plr_fDiveSoundDelay);
  _pShell->DeclareSymbol("user FLOAT plr_fWalkSoundDelay;", &plr_fWalkSoundDelay);
  _pShell->DeclareSymbol("user FLOAT plr_fRunSoundDelay;",  &plr_fRunSoundDelay);

  _pShell->DeclareSymbol("persistent user FLOAT cli_fPredictPlayersRange;",&cli_fPredictPlayersRange);
  _pShell->DeclareSymbol("persistent user FLOAT cli_fPredictItemsRange;",  &cli_fPredictItemsRange  );
  _pShell->DeclareSymbol("persistent user FLOAT cli_tmPredictFoe;",        &cli_tmPredictFoe        );
  _pShell->DeclareSymbol("persistent user FLOAT cli_tmPredictAlly;",       &cli_tmPredictAlly       );
  _pShell->DeclareSymbol("persistent user FLOAT cli_tmPredictEnemy;",      &cli_tmPredictEnemy      );

  _pShell->DeclareSymbol("     INDEX hud_bShowAll;",     &hud_bShowAll);
  _pShell->DeclareSymbol("user INDEX hud_bShowInfo;",    &hud_bShowInfo);
  _pShell->DeclareSymbol("user const FLOAT net_tmLatencyAvg;", &net_tmLatencyAvg);
  _pShell->DeclareSymbol("persistent user INDEX hud_bShowLatency;", &hud_bShowLatency);
  _pShell->DeclareSymbol("persistent user INDEX hud_iShowPlayers;", &hud_iShowPlayers);
  _pShell->DeclareSymbol("persistent user INDEX hud_iSortPlayers;", &hud_iSortPlayers);
  _pShell->DeclareSymbol("persistent user INDEX hud_bShowWeapon;",  &hud_bShowWeapon);
  _pShell->DeclareSymbol("persistent user INDEX hud_bShowMessages;",&hud_bShowMessages);
  _pShell->DeclareSymbol("persistent user FLOAT hud_fScaling;",     &hud_fScaling);
  _pShell->DeclareSymbol("persistent user FLOAT hud_fOpacity;",     &hud_fOpacity);
  _pShell->DeclareSymbol("persistent user FLOAT hud_tmWeaponsOnScreen;",  &hud_tmWeaponsOnScreen);
  _pShell->DeclareSymbol("persistent user FLOAT hud_tmLatencySnapshot;",  &hud_tmLatencySnapshot);
  _pShell->DeclareSymbol("persistent user FLOAT plr_fBreathingStrength;", &plr_fBreathingStrength);
  _pShell->DeclareSymbol("INDEX cht_bKillFinalBoss;",  &cht_bKillFinalBoss);
  _pShell->DeclareSymbol("INDEX cht_bDebugFinalBoss;", &cht_bDebugFinalBoss);
  _pShell->DeclareSymbol("INDEX cht_bDumpFinalBossData;", &cht_bDumpFinalBossData);
  _pShell->DeclareSymbol("INDEX cht_bDebugFinalBossAnimations;", &cht_bDebugFinalBossAnimations);
  _pShell->DeclareSymbol("INDEX cht_bDumpPlayerShading;", &cht_bDumpPlayerShading);
  _pShell->DeclareSymbol("persistent user INDEX hud_bShowMatchInfo;", &hud_bShowMatchInfo);

  _pShell->DeclareSymbol("persistent user FLOAT wpn_fRecoilSpeed[17];",   &wpn_fRecoilSpeed);
  _pShell->DeclareSymbol("persistent user FLOAT wpn_fRecoilLimit[17];",   &wpn_fRecoilLimit);
  _pShell->DeclareSymbol("persistent user FLOAT wpn_fRecoilDampUp[17];",  &wpn_fRecoilDampUp);
  _pShell->DeclareSymbol("persistent user FLOAT wpn_fRecoilDampDn[17];",  &wpn_fRecoilDampDn);
  _pShell->DeclareSymbol("persistent user FLOAT wpn_fRecoilOffset[17];",  &wpn_fRecoilOffset);
  _pShell->DeclareSymbol("persistent user FLOAT wpn_fRecoilFactorP[17];", &wpn_fRecoilFactorP);
  _pShell->DeclareSymbol("persistent user FLOAT wpn_fRecoilFactorZ[17];", &wpn_fRecoilFactorZ);

  // cheats
  _pShell->DeclareSymbol("user INDEX cht_bGod;",       &cht_bGod);
  _pShell->DeclareSymbol("user INDEX cht_bFly;",       &cht_bFly);
  _pShell->DeclareSymbol("user INDEX cht_bGhost;",     &cht_bGhost);
  _pShell->DeclareSymbol("user INDEX cht_bInvisible;", &cht_bInvisible);
  _pShell->DeclareSymbol("user INDEX cht_bGiveAll;",   &cht_bGiveAll);
  _pShell->DeclareSymbol("user INDEX cht_bKillAll;",   &cht_bKillAll);
  _pShell->DeclareSymbol("user INDEX cht_bOpen;",      &cht_bOpen);
  _pShell->DeclareSymbol("user INDEX cht_bAllMessages;", &cht_bAllMessages);
  _pShell->DeclareSymbol("user FLOAT cht_fTranslationMultiplier ;", &cht_fTranslationMultiplier);
  _pShell->DeclareSymbol("user FLOAT cht_fMaxShield;", &cht_fMaxShield);
  _pShell->DeclareSymbol("user INDEX cht_bRefresh;", &cht_bRefresh);
  // this one is masqueraded cheat enable variable
  _pShell->DeclareSymbol("INDEX cht_bEnable;", &cht_bEnable);

  // this cheat is always enabled
  _pShell->DeclareSymbol("user INDEX cht_iGoToMarker;", &cht_iGoToMarker);

  // player speed and view parameters, not declared except in internal build
  #if 0
    _pShell->DeclareSymbol("user FLOAT plr_fViewHeightStand;", &plr_fViewHeightStand);
    _pShell->DeclareSymbol("user FLOAT plr_fViewHeightCrouch;",&plr_fViewHeightCrouch);
    _pShell->DeclareSymbol("user FLOAT plr_fViewHeightSwim;",  &plr_fViewHeightSwim);
    _pShell->DeclareSymbol("user FLOAT plr_fViewHeightDive;",  &plr_fViewHeightDive);
    _pShell->DeclareSymbol("user FLOAT plr_fViewDampFactor;",         &plr_fViewDampFactor);
    _pShell->DeclareSymbol("user FLOAT plr_fViewDampLimitGroundUp;",  &plr_fViewDampLimitGroundUp);
    _pShell->DeclareSymbol("user FLOAT plr_fViewDampLimitGroundDn;",  &plr_fViewDampLimitGroundDn);
    _pShell->DeclareSymbol("user FLOAT plr_fViewDampLimitWater;",     &plr_fViewDampLimitWater);
    _pShell->DeclareSymbol("user FLOAT plr_fAcceleration;",  &plr_fAcceleration);
    _pShell->DeclareSymbol("user FLOAT plr_fDeceleration;",  &plr_fDeceleration);
    _pShell->DeclareSymbol("user FLOAT plr_fSpeedForward;",  &plr_fSpeedForward);
    _pShell->DeclareSymbol("user FLOAT plr_fSpeedBackward;", &plr_fSpeedBackward);
    _pShell->DeclareSymbol("user FLOAT plr_fSpeedSide;",     &plr_fSpeedSide);
    _pShell->DeclareSymbol("user FLOAT plr_fSpeedUp;",       &plr_fSpeedUp);
  #endif
  _pShell->DeclareSymbol("persistent user FLOAT plr_fFOV;", &plr_fFOV);
  _pShell->DeclareSymbol("persistent user FLOAT plr_fFrontClipDistance;", &plr_fFrontClipDistance);
  _pShell->DeclareSymbol("persistent user INDEX plr_bRenderPicked;", &plr_bRenderPicked);
  _pShell->DeclareSymbol("persistent user INDEX plr_bRenderPickedParticles;", &plr_bRenderPickedParticles);
  _pShell->DeclareSymbol("persistent user INDEX plr_bOnlySam;", &plr_bOnlySam);
  _pShell->DeclareSymbol("persistent user INDEX ent_bReportBrokenChains;", &ent_bReportBrokenChains);
  _pShell->DeclareSymbol("persistent user FLOAT ent_tmMentalIn  ;", &ent_tmMentalIn  );
  _pShell->DeclareSymbol("persistent user FLOAT ent_tmMentalOut ;", &ent_tmMentalOut );
  _pShell->DeclareSymbol("persistent user FLOAT ent_tmMentalFade;", &ent_tmMentalFade);
  _pShell->DeclareSymbol("persistent user FLOAT gfx_fEnvParticlesDensity;", &gfx_fEnvParticlesDensity);
  _pShell->DeclareSymbol("persistent user FLOAT gfx_fEnvParticlesRange;", &gfx_fEnvParticlesRange);

  // player appearance interface
  _pShell->DeclareSymbol("INDEX SetPlayerAppearance(INDEX, INDEX, INDEX, INDEX);", &SetPlayerAppearance);
  _pShell->DeclareSymbol("user INDEX dbg_strEnemySpawnerInfo;", &dbg_strEnemySpawnerInfo);
  _pShell->DeclareSymbol("user INDEX dbg_strEnemyBaseInfo;", &dbg_strEnemyBaseInfo);

  // call player weapons persistant variable initialization
  extern void CPlayerWeapons_Init(void);
  CPlayerWeapons_Init();

  // initialize HUD
  InitHUD();

  // precache
  CPlayer_Precache();
}

// clean up
void CPlayer_OnEndClass(void)
{
  EndHUD();
}

CTString GetDifficultyString(void)
{
  if (GetSP()->sp_bMental) { return TRANS("Mental"); }

  switch (GetSP()->sp_gdGameDifficulty) {
  case CSessionProperties::GD_TOURIST:  return TRANS("Tourist");
  case CSessionProperties::GD_EASY:     return TRANS("Easy");
  default:
  case CSessionProperties::GD_NORMAL:   return TRANS("Normal");
  case CSessionProperties::GD_HARD:     return TRANS("Hard");
  case CSessionProperties::GD_EXTREME:  return TRANS("Serious");
  }
}
// armor & health constants getters

FLOAT MaxArmor(void)
{
  if (GetSP()->sp_gdGameDifficulty<=CSessionProperties::GD_EASY) {
    return 300;
  } else {
    return 200;
  }
}
FLOAT TopArmor(void)
{
  if (GetSP()->sp_gdGameDifficulty<=CSessionProperties::GD_EASY) {
    return 200;
  } else {
    return 100;
  }
}
FLOAT MaxHealth(void)
{
  if (GetSP()->sp_gdGameDifficulty<=CSessionProperties::GD_EASY) {
    return 300;
  } else {
    return 200;
  }
}
FLOAT TopHealth(void)
{
  if (GetSP()->sp_gdGameDifficulty<=CSessionProperties::GD_EASY) {
    return 200;
  } else {
    return 100;
  }
}

// info structure
static EntityInfo eiPlayerGround = {
  EIBT_FLESH, 80.0f,
  0.0f, 1.7f, 0.0f,     // source (eyes)
  0.0f, 1.0f, 0.0f,     // target (body)
};
static EntityInfo eiPlayerCrouch = {
  EIBT_FLESH, 80.0f,
  0.0f, 1.2f, 0.0f,     // source (eyes)
  0.0f, 0.7f, 0.0f,     // target (body)
};
static EntityInfo eiPlayerSwim = {
  EIBT_FLESH, 40.0f,
  0.0f, 0.0f, 0.0f,     // source (eyes)
  0.0f, 0.0f, 0.0f,     // target (body)
};


// animation light specific
#define LIGHT_ANIM_MINIGUN 2
#define LIGHT_ANIM_TOMMYGUN 3
#define LIGHT_ANIM_COLT_SHOTGUN 4
#define LIGHT_ANIM_NONE 5

const char *NameForState(PlayerState pst)
{
  switch(pst) {
  case PST_STAND: return "stand";
  case PST_CROUCH: return "crouch";
  case PST_FALL: return "fall";
  case PST_SWIM: return "swim";
  case PST_DIVE: return "dive";
  default: return "???";
  };
}


// print explanation on how a player died
void PrintPlayerDeathMessage(CPlayer *ppl, const EDeath &eDeath)
{
  CTString strMyName = ppl->GetPlayerName();
  CEntity *penKiller = eDeath.eLastDamage.penInflictor;
  // if killed by a valid entity
  if (penKiller!=NULL) {
    // if killed by a player
    if (IsOfClass(penKiller, "Player")) {
      // if not self
      if (penKiller!=ppl) {
        CTString strKillerName = ((CPlayer*)penKiller)->GetPlayerName();

        if(eDeath.eLastDamage.dmtType==DMT_TELEPORT) {
          CPrintF(TRANS("%s telefragged %s\n"), strKillerName, strMyName);
        } else if(eDeath.eLastDamage.dmtType==DMT_CLOSERANGE) {
          CPrintF(TRANS("%s cut %s into pieces\n"), strKillerName, strMyName);
        } else if(eDeath.eLastDamage.dmtType==DMT_CHAINSAW) {
          CPrintF(TRANS("%s cut %s into pieces\n"), strKillerName, strMyName);
        } else if(eDeath.eLastDamage.dmtType==DMT_BULLET) {
          CPrintF(TRANS("%s poured lead into %s\n"), strKillerName, strMyName);
        } else if(eDeath.eLastDamage.dmtType==DMT_PROJECTILE || eDeath.eLastDamage.dmtType==DMT_EXPLOSION) {
          CPrintF(TRANS("%s blew %s away\n"), strKillerName, strMyName);
        } else if(eDeath.eLastDamage.dmtType==DMT_CANNONBALL) {
          CPrintF(TRANS("%s smashed %s with a cannon\n"), strKillerName, strMyName);
        } else if(eDeath.eLastDamage.dmtType==DMT_CANNONBALL_EXPLOSION) {
          CPrintF(TRANS("%s nuked %s\n"), strKillerName, strMyName);
        } else {
          CPrintF(TRANS("%s killed %s\n"), strKillerName, strMyName);
        }
      } else {
        // make message from damage type
        switch(eDeath.eLastDamage.dmtType) {
        case DMT_DROWNING:  CPrintF(TRANS("%s drowned\n"), strMyName); break;
        case DMT_BURNING:   CPrintF(TRANS("%s burst into flames\n"), strMyName); break;
        case DMT_SPIKESTAB: CPrintF(TRANS("%s fell into a spike-hole\n"), strMyName); break;
        case DMT_FREEZING:  CPrintF(TRANS("%s has frozen\n"), strMyName); break;
        case DMT_ACID:      CPrintF(TRANS("%s dissolved\n"), strMyName); break;
        case DMT_PROJECTILE:
        case DMT_EXPLOSION:
          CPrintF(TRANS("%s blew himself away\n"), strMyName); break;
        default:            CPrintF(TRANS("%s has committed suicide\n"), strMyName);
        }
      }
    // if killed by an enemy
    } else if (IsDerivedFromClass(penKiller, "Enemy Base")) {
      // check for telefrag first
      if(eDeath.eLastDamage.dmtType==DMT_TELEPORT) {
        CPrintF(TRANS("%s was telefragged\n"), strMyName);
        return;
      }
      // describe how this enemy killed player
      CPrintF("%s\n", (const char*)((CEnemyBase*)penKiller)->GetPlayerKillDescription(strMyName, eDeath));

    // if killed by some other entity
    } else {
      // make message from damage type
      switch(eDeath.eLastDamage.dmtType) {
      case DMT_SPIKESTAB: CPrintF(TRANS("%s was pierced\n"), strMyName); break;
      case DMT_BRUSH:     CPrintF(TRANS("%s was squashed\n"), strMyName); break;
      case DMT_ABYSS:     CPrintF(TRANS("%s went over the edge\n"), strMyName); break;
      case DMT_IMPACT:    CPrintF(TRANS("%s swashed\n"), strMyName); break;
      case DMT_HEAT:      CPrintF(TRANS("%s stood in the sun for too long\n"), strMyName); break;
      default:            CPrintF(TRANS("%s passed away\n"), strMyName);
      }
    }
  // if no entity pointer (shouldn't happen)
  } else {
    CPrintF(TRANS("%s is missing in action\n"), strMyName);
  }
}

// H3D **************************************
static void UpdateAniDigits(H3D_AniNum& an)
{
	if(_pTimer->GetHighPrecisionTimer().GetMilliseconds() - an.tmLastTick < an.tmTick) { return; }
	if(an.iCurrent < an.iTo) {
		INDEX iTmp = an.iTo - an.iCurrent;
		INDEX iPow = 1;
		while(iTmp != 0) {
			
			INDEX iDig = iTmp%10;
			if(iDig > 0) {
				an.iCurrent += iPow;
			}
			iTmp /= 10;
			iPow *= 10;
		}
	}
	if(an.iCurrent > an.iTo) {
		INDEX iTmp = -(an.iTo - an.iCurrent);
		INDEX iPow = 1;
		while(iTmp != 0) {
			
			INDEX iDig = iTmp%10;
			if(iDig > 0) {
				an.iCurrent -= iPow;
			}
			iTmp /= 10;
			iPow *= 10;
		}
	}
	an.tmLastTick = _pTimer->GetHighPrecisionTimer().GetMilliseconds();
}

static void UpdateAniNum(H3D_AniNum& an)
{
	if(_pTimer->GetHighPrecisionTimer().GetMilliseconds() - an.tmLastTick < an.tmTick) { return; }
	if(an.iCurrent < an.iTo) {
		an.iCurrent = ClampUp(an.iCurrent + an.iInc, an.iTo);
	}
	if(an.iCurrent > an.iTo) {
		an.iCurrent = ClampDn(an.iCurrent - an.iInc, an.iTo);
	}
	an.tmLastTick = _pTimer->GetHighPrecisionTimer().GetMilliseconds();
}

// /H3D *************************************

%}

class export CPlayer : CPlayerEntity {
name      "Player";
thumbnail "";
features  "ImplementsOnInitClass", "ImplementsOnEndClass", "CanBePredictable";

properties:
  1 CTString m_strName "Name" = "<unnamed player>",
  2 COLOR m_ulLastButtons = 0x0,              // buttons last pressed
  3 FLOAT m_fArmor = 0.0f,                    // armor
  4 CTString m_strGroup = "",                 // group name for world change
  5 INDEX m_ulKeys = 0,                       // mask for all picked-up keys
  6 FLOAT m_fMaxHealth = 1,                   // default health supply player can have
  7 INDEX m_ulFlags = 0,                      // various flags
  8 INDEX m_iMoney = 0,                       // money money money DOSH                        H3D
  9 FLOAT m_fShield = 0.0f,                   // shield                                        H3D
 10 FLOAT m_fMaxShield = 0.0f,                // max shield                                    H3D
 11 FLOAT m_fShieldDelay = 10.0f,             // charge delay
 12 BOOL  m_bShieldCharging = FALSE,          // checking for Charging sound
  
 16 CEntityPointer m_penWeapons,              // player weapons
 17 CEntityPointer m_penAnimator,             // player animator
 18 CEntityPointer m_penView,                 // player view
 19 CEntityPointer m_pen3rdPersonView,        // player 3rd person view
 20 INDEX m_iViewState=PVT_PLAYEREYES,        // view state
 21 INDEX m_iLastViewState=PVT_PLAYEREYES,    // last view state

 26 CAnimObject m_aoLightAnimation,           // light animation object
 27 FLOAT m_fDamageAmmount = 0.0f,            // how much was last wound
 28 FLOAT m_tmWoundedTime  = 0.0f,            // when was last wound
 29 FLOAT m_tmScreamTime   = 0.0f,            // when was last wound sound played

 33 INDEX m_iGender = GENDER_MALE,            // male/female offset in various tables
 34 enum PlayerState m_pstState = PST_STAND,  // current player state
 35 FLOAT m_fFallTime = 0.0f,                 // time passed when falling
 36 FLOAT m_fSwimTime = 0.0f,                 // time when started swimming
 45 FLOAT m_tmOutOfWater = 0.0f,              // time when got out of water last time
 37 FLOAT m_tmMoveSound = 0.0f,           // last time move sound was played
 38 BOOL  m_bMoveSoundLeft = TRUE,        // left or right walk channel is current
 39 FLOAT m_tmNextAmbientOnce = 0.0f,     // next time to play local ambient sound
 43 FLOAT m_tmMouthSoundLast = 0.0f,      // time last played some repeating mouth sound

 40 CEntityPointer m_penCamera,           // camera for current cinematic sequence, or null
 41 CTString m_strCenterMessage="",       // center message
 42 FLOAT m_tmCenterMessageEnd = 0.0f,    // last time to show centered message
 48 BOOL m_bPendingMessage = FALSE,   // message sound pending to be played
 47 FLOAT m_tmMessagePlay = 0.0f,     // when to play the message sound
 49 FLOAT m_tmAnalyseEnd = 0.0f,      // last time to show analysation
 50 BOOL m_bComputerInvoked = FALSE,  // set if computer was invoked at least once
 57 FLOAT m_tmAnimateInbox = -100.0f,      // show animation of inbox icon animation
 
 44 CEntityPointer m_penMainMusicHolder,

 51 FLOAT m_tmLastDamage = -1.0f,
 52 FLOAT m_fMaxDamageAmmount = 0.0f,
 53 FLOAT3D m_vDamage = FLOAT3D(0,0,0),
 54 FLOAT m_tmSpraySpawned = -1.0f,
 55 FLOAT m_fSprayDamage = 0.0f,
 56 CEntityPointer m_penSpray,

 // sounds
 60 CSoundObject m_soWeapon0,
 61 CSoundObject m_soWeapon1,
 62 CSoundObject m_soWeapon2,
 63 CSoundObject m_soWeapon3,
 64 CSoundObject m_soWeaponAmbient,
 65 CSoundObject m_soPowerUpBeep,

 70 CSoundObject m_soMouth,     // breating, yelling etc.
 71 CSoundObject m_soFootL,     // walking etc.
 72 CSoundObject m_soFootR,
 73 CSoundObject m_soBody,          // splashing etc.
 74 CSoundObject m_soLocalAmbientLoop,  // local ambient that only this player hears
 75 CSoundObject m_soLocalAmbientOnce,  // local ambient that only this player hears
 76 CSoundObject m_soMessage,  // message sounds
 77 CSoundObject m_soHighScore, // high score sound
 78 CSoundObject m_soSpeech,    // for quotes
 79 CSoundObject m_soSniperZoom, // for sniper zoom sound

 80 CSoundObject m_soShield,     // H3D - Shield

 81 INDEX m_iMana    = 0,        // current score worth for killed player
 94 FLOAT m_fManaFraction = 0.0f,// fractional part of mana, for slow increase with time
 84 INDEX m_iHighScore = 0,      // internal hiscore for demo playing
 85 INDEX m_iBeatenHighScore = 0,    // hiscore that was beaten
 89 FLOAT m_tmLatency = 0.0f,               // player-server latency (in seconds)
 // for latency averaging
 88 FLOAT m_tmLatencyLastAvg = 0.0f, 
 87 FLOAT m_tmLatencyAvgSum = 0.0f, 
 86 INDEX m_ctLatencyAvg = 0, 

 96 BOOL  m_bEndOfLevel = FALSE,
 97 BOOL  m_bEndOfGame  = FALSE,
 98 INDEX m_iMayRespawn = 0,     // must get to 2 to be able to respawn
 99 FLOAT m_tmSpawned = 0.0f,   // when player was spawned
 100 FLOAT3D m_vDied = FLOAT3D(0,0,0),  // where player died (for respawn in-place)
 101 FLOAT3D m_aDied = FLOAT3D(0,0,0),

 // statistics
 103 FLOAT m_tmEstTime  = 0.0f,   // time estimated for this level
 105 INDEX m_iTimeScore = 0,
 106 INDEX m_iStartTime = 0,      // game start time (ansi c time_t type)
 107 INDEX m_iEndTime   = 0,      // game end time (ansi c time_t type)
 108 FLOAT m_tmLevelStarted = 0.0f,  // game time when level started
 93 CTString m_strLevelStats = "",  // detailed statistics for each level

 // auto action vars
 110 CEntityPointer m_penActionMarker,  // current marker for auto actions
 111 FLOAT m_fAutoSpeed = 0.0f, // speed to go towards the marker
 112 INDEX m_iAutoOrgWeapon = 0, // original weapon for autoactions
 113 FLOAT3D m_vAutoSpeed = FLOAT3D(0,0,0),
 114 FLOAT m_tmSpiritStart = 0.0f,
 115 FLOAT m_tmFadeStart = 0.0f,

 // 'picked up' display vars
 120 FLOAT m_tmLastPicked = -10000.0f,  // when something was last picked up
 121 CTString m_strPickedName = "",     // name of item picked
 122 FLOAT m_fPickedAmmount = 0.0f,     // total picked ammount
 123 FLOAT m_fPickedMana = 0.0f,        // total picked mana

 // shaker values
 130 INDEX m_iLastHealth = 0,
 131 INDEX m_iLastArmor  = 0,
 132 INDEX m_iLastAmmo   = 0,
 135 FLOAT m_tmHealthChanged = -9,
 136 FLOAT m_tmArmorChanged  = -9,
 137 FLOAT m_tmAmmoChanged   = -9,
 
 138 FLOAT m_tmMinigunAutoFireStart = -1.0f,

 150 FLOAT3D m_vLastStain  = FLOAT3D(0,0,0), // where last stain was left
   
 // for mouse lag elimination via prescanning
 151 ANGLE3D m_aLastRotation = FLOAT3D(0,0,0),
 152 ANGLE3D m_aLastViewRotation = FLOAT3D(0,0,0),
 153 FLOAT3D m_vLastTranslation = FLOAT3D(0,0,0),
 154 ANGLE3D m_aLocalRotation = FLOAT3D(0,0,0),
 155 ANGLE3D m_aLocalViewRotation = FLOAT3D(0,0,0),
 156 FLOAT3D m_vLocalTranslation = FLOAT3D(0,0,0),

 // powerups (DO NOT CHANGE ORDER!) - needed by HUD.cpp
 160 FLOAT m_tmInvisibility    = 0.0f, 
 161 FLOAT m_tmInvulnerability = 0.0f, 
 162 FLOAT m_tmSeriousDamage   = 0.0f, 
 163 FLOAT m_tmSeriousSpeed    = 0.0f, 
 166 FLOAT m_tmInvisibilityMax    = 30.0f,
 167 FLOAT m_tmInvulnerabilityMax = 30.0f,
 168 FLOAT m_tmSeriousDamageMax   = 40.0f,
 169 FLOAT m_tmSeriousSpeedMax    = 20.0f,

 180 FLOAT m_tmChainShakeEnd = 0.0f, // used to determine when to stop shaking due to chainsaw damage
 181 FLOAT m_fChainShakeStrength = 1.0f, // strength of shaking
 182 FLOAT m_fChainShakeFreqMod = 1.0f,  // shaking frequency modifier
 183 FLOAT m_fChainsawShakeDX = 0.0f, 
 184 FLOAT m_fChainsawShakeDY = 0.0f,

 190 INDEX m_iSeriousBombCount = 0,      // ammount of serious bombs player owns
 191 INDEX m_iLastSeriousBombCount = 0,  // ammount of serious bombs player had before firing
 192 FLOAT m_tmSeriousBombFired = -10.0f,  // when the bomb was last fired

 200 CModelObject m_moH3D,               //  *3D HUD***********************************************
 201 FLOAT m_h3dAppearTime = 5.0f,
 202 FLOAT m_fBorderHealth = 0.0f,
 203 ANGLE3D m_aWeaponSway = ANGLE3D(0,0,0),
 204 ANGLE3D m_aWeaponSwayOld = ANGLE3D(0,0,0),
 205 BOOL m_bWalking = FALSE, // FOR WEAPONS

 206 FLOAT m_h3dAppearTimeArmor = 5.0f,
 207 FLOAT m_fBorderArmor = 0.0f,
 232 FLOAT m_h3dAppearTimeShield = 5.0f,
 233 FLOAT m_fBorderShield = 0.0f,
 208 FLOAT m_fDamageShakeX = 0.0f,
 209 FLOAT m_fDamageShakeY = 0.0f,
 210 FLOAT m_tmDamageShakeEnd = 0.0f,
 211 FLOAT m_fDamageShakePower = 1.0f,
 212 FLOAT3D m_vDamageShakeOffset = FLOAT3D(0,0,0),
 212 FLOAT3D m_vDamageShakeOffsetLast = FLOAT3D(0,0,0),

 213 FLOAT m_fDamageTaken = 0.0f,
 214 ANGLE3D m_aH3DSway = ANGLE3D(0,0,0),
 215 ANGLE3D m_aH3DSwayOld = ANGLE3D(0,0,0),

 216 FLOAT m_fShieldDamageAmmount = 0.0f,       // how much was last wound to shield
 217 FLOAT m_tmShieldWoundTime    = -10.0f,     // when was last wound to shield
 218 FLOAT m_tmShieldScreamTime   = -10.0f,     // when was last wound to shield sound played
 219 FLOAT m_tmShieldBroken       = -10.0f,     // when shield was broken
 233 FLOAT m_fShieldBrokenAmmount = 0.0f,

 220 CModelObject m_moShop,               //  * SHOP ********************************************
 221 CEntityPointer m_penShop,
 222 INDEX m_iSelectedShopIndex = 0,
 223 BOOL m_bShowingTabInfo = FALSE,
 224 BOOL m_bShopInTheWorld = FALSE,
 225 FLOAT m_tmMoneyDropped = -10.0f,     //  ***************************************************

 230 BOOL m_bSpectatorDeath = FALSE, // means we're dying for spectator purposes
 231 CEntityPointer m_penWorldLinkController,

 232 FLOAT3D m_vShieldBroken=FLOAT3D(0,0,0),// position for particles of destroyed shield

{
  ShellLaunchData ShellLaunchData_array;  // array of data describing flying empty shells
  INDEX m_iFirstEmptySLD;                         // index of last added empty shell

  BulletSprayLaunchData BulletSprayLaunchData_array;  // array of data describing flying bullet sprays
  INDEX m_iFirstEmptyBSLD;                            // index of last added bullet spray

  GoreSprayLaunchData GoreSprayLaunchData_array;   // array of data describing gore sprays
  INDEX m_iFirstEmptyGSLD;                         // index of last added gore spray

  ULONG ulButtonsNow;  ULONG ulButtonsBefore;
  ULONG ulNewButtons;
  ULONG ulReleasedButtons;

  BOOL  bUseButtonHeld;

  // listener
  CSoundListener sliSound;
  // light
  CLightSource m_lsLightSource;

  TIME m_tmPredict;  // time to predict the entity to

  // all messages in the inbox
  CDynamicStackArray<CCompMessageID> m_acmiMessages;
  INDEX m_ctUnreadMessages;

  // statistics
  PlayerStats m_psLevelStats;
  PlayerStats m_psLevelTotal;
  PlayerStats m_psGameStats;
  PlayerStats m_psGameTotal;

  CModelObject m_moRender;                  // model object to render - this one can be customized
  H3D_AniNum anCurrentAmmo;
  H3D_AniNum anCurrentHealth;
  H3D_AniNum anCurrentArmor;

  H3D_AniNum anCurrentShield;

  H3D_AniNum anCurrentScore;
  H3D_AniNum anCurrentFrags;
  H3D_AniNum anCurrentDeaths;
  H3D_AniNum anCurrentMana;
  H3D_AniNum anCurrentMoney;

  CEntityPointer m_penSpectatorPlayer; //  * SPECTATOR *****************************************
  INDEX m_iSpectatorPlayerIndex;
}

components:
  1 class   CLASS_PLAYER_WEAPONS  "Classes\\PlayerWeapons.ecl",
  2 class   CLASS_PLAYER_ANIMATOR "Classes\\PlayerAnimator.ecl",
  3 class   CLASS_PLAYER_VIEW     "Classes\\PlayerView.ecl",
  4 class   CLASS_BASIC_EFFECT    "Classes\\BasicEffect.ecl",
  5 class   CLASS_BLOOD_SPRAY     "Classes\\BloodSpray.ecl", 
  6 class   CLASS_SERIOUSBOMB     "Classes\\SeriousBomb.ecl",
  7 class	  CLASS_MONEYITEM       "Classes\\MoneyItem.ecl",
  8 class   CLASS_WORLDLINKCONTROLLER "Classes\\WorldLinkController.ecl",
 10 model   MODEL_BAG             "Models\\Items\\Money\\Bag\\Bag.mdl",
 11 texture TEXTURE_BAG           "Models\\Items\\Money\\Bag\\Bag.tex",

// gender specific sounds - make sure that offset is exactly 100 
 50 sound SOUND_WATER_ENTER     "Sounds\\Player\\WaterEnter.wav",
 51 sound SOUND_WATER_LEAVE     "Sounds\\Player\\WaterLeave.wav",
 52 sound SOUND_WALK_L          "Sounds\\Player\\WalkL.wav",
 53 sound SOUND_WALK_R          "Sounds\\Player\\WalkR.wav",
 54 sound SOUND_SWIM_L          "Sounds\\Player\\SwimL.wav",
 55 sound SOUND_SWIM_R          "Sounds\\Player\\SwimR.wav",
 56 sound SOUND_DIVE_L          "Sounds\\Player\\Dive.wav",
 57 sound SOUND_DIVE_R          "Sounds\\Player\\Dive.wav",
 58 sound SOUND_DIVEIN          "Sounds\\Player\\DiveIn.wav",
 59 sound SOUND_DIVEOUT         "Sounds\\Player\\DiveOut.wav",
 60 sound SOUND_DROWN           "Sounds\\Player\\Drown.wav",
 61 sound SOUND_INHALE0         "Sounds\\Player\\Inhale00.wav",
 62 sound SOUND_JUMP            "Sounds\\Player\\Jump.wav",
 63 sound SOUND_LAND            "Sounds\\Player\\Land.wav",
 66 sound SOUND_DEATH           "Sounds\\Player\\Death.wav",
 67 sound SOUND_DEATHWATER      "Sounds\\Player\\DeathWater.wav",
 70 sound SOUND_WATERWALK_L     "Sounds\\Player\\WalkWaterL.wav",
 71 sound SOUND_WATERWALK_R     "Sounds\\Player\\WalkWaterR.wav",
 72 sound SOUND_INHALE1         "Sounds\\Player\\Inhale01.wav",
 73 sound SOUND_INHALE2         "Sounds\\Player\\Inhale02.wav",
 75 sound SOUND_WALK_SAND_L     "Sounds\\Player\\WalkSandL.wav",
 76 sound SOUND_WALK_SAND_R     "Sounds\\Player\\WalkSandR.wav",
//178 sound SOUND_HIGHSCORE       "Sounds\\Player\\HighScore.wav",
 80 sound SOUND_WOUNDWEAK       "Sounds\\Player\\WoundWeak.wav",
 81 sound SOUND_WOUNDMEDIUM     "Sounds\\Player\\WoundMedium.wav",
 82 sound SOUND_WOUNDSTRONG     "Sounds\\Player\\WoundStrong.wav",
 85 sound SOUND_WOUNDWATER      "Sounds\\Player\\WoundWater.wav",
 86 sound SOUND_WALK_GRASS_L    "SoundsMP\\Player\\WalkGrassL.wav",
 87 sound SOUND_WALK_GRASS_R    "SoundsMP\\Player\\WalkGrassR.wav",
 88 sound SOUND_WALK_WOOD_L     "SoundsMP\\Player\\WalkWoodL.wav",
 89 sound SOUND_WALK_WOOD_R     "SoundsMP\\Player\\WalkWoodR.wav",
 90 sound SOUND_WALK_SNOW_L     "SoundsMP\\Player\\WalkSnowL.wav",
 91 sound SOUND_WALK_SNOW_R     "SoundsMP\\Player\\WalkSnowR.wav",
 92 sound SOUND_BLOWUP          "SoundsMP\\Player\\BlowUp.wav",

150 sound SOUND_F_WATER_ENTER   "SoundsMP\\Player\\Female\\WaterEnter.wav",
151 sound SOUND_F_WATER_LEAVE   "SoundsMP\\Player\\Female\\WaterLeave.wav",
152 sound SOUND_F_WALK_L        "SoundsMP\\Player\\Female\\WalkL.wav",
153 sound SOUND_F_WALK_R        "SoundsMP\\Player\\Female\\WalkR.wav",
154 sound SOUND_F_SWIM_L        "SoundsMP\\Player\\Female\\SwimL.wav",
155 sound SOUND_F_SWIM_R        "SoundsMP\\Player\\Female\\SwimR.wav",
156 sound SOUND_F_DIVE_L        "SoundsMP\\Player\\Female\\Dive.wav",
157 sound SOUND_F_DIVE_R        "SoundsMP\\Player\\Female\\Dive.wav",
158 sound SOUND_F_DIVEIN        "SoundsMP\\Player\\Female\\DiveIn.wav",
159 sound SOUND_F_DIVEOUT       "SoundsMP\\Player\\Female\\DiveOut.wav",
160 sound SOUND_F_DROWN         "SoundsMP\\Player\\Female\\Drown.wav",
161 sound SOUND_F_INHALE0       "SoundsMP\\Player\\Female\\Inhale00.wav",
162 sound SOUND_F_JUMP          "SoundsMP\\Player\\Female\\Jump.wav",
163 sound SOUND_F_LAND          "SoundsMP\\Player\\Female\\Land.wav",
166 sound SOUND_F_DEATH         "SoundsMP\\Player\\Female\\Death.wav",
167 sound SOUND_F_DEATHWATER    "SoundsMP\\Player\\Female\\DeathWater.wav",
170 sound SOUND_F_WATERWALK_L   "SoundsMP\\Player\\Female\\WalkWaterL.wav",
171 sound SOUND_F_WATERWALK_R   "SoundsMP\\Player\\Female\\WalkWaterR.wav",
172 sound SOUND_F_INHALE1       "SoundsMP\\Player\\Female\\Inhale01.wav",
173 sound SOUND_F_INHALE2       "SoundsMP\\Player\\Female\\Inhale02.wav",
175 sound SOUND_F_WALK_SAND_L   "SoundsMP\\Player\\Female\\WalkSandL.wav",
176 sound SOUND_F_WALK_SAND_R   "SoundsMP\\Player\\Female\\WalkSandR.wav",
// 78 sound SOUND_F_HIGHSCORE     "SoundsMP\\Player\\Female\\HighScore.wav",
180 sound SOUND_F_WOUNDWEAK     "SoundsMP\\Player\\Female\\WoundWeak.wav",
181 sound SOUND_F_WOUNDMEDIUM   "SoundsMP\\Player\\Female\\WoundMedium.wav",
182 sound SOUND_F_WOUNDSTRONG   "SoundsMP\\Player\\Female\\WoundStrong.wav",
185 sound SOUND_F_WOUNDWATER    "SoundsMP\\Player\\Female\\WoundWater.wav",
186 sound SOUND_F_WALK_GRASS_L  "SoundsMP\\Player\\Female\\WalkGrassL.wav",
187 sound SOUND_F_WALK_GRASS_R  "SoundsMP\\Player\\Female\\WalkGrassR.wav",
188 sound SOUND_F_WALK_WOOD_L   "SoundsMP\\Player\\Female\\WalkWoodL.wav",
189 sound SOUND_F_WALK_WOOD_R   "SoundsMP\\Player\\Female\\WalkWoodR.wav",
190 sound SOUND_F_WALK_SNOW_L   "SoundsMP\\Player\\Female\\WalkSnowL.wav",
191 sound SOUND_F_WALK_SNOW_R   "SoundsMP\\Player\\Female\\WalkSnowR.wav",

// gender-independent sounds
200 sound SOUND_SILENCE         "Sounds\\Misc\\Silence.wav",
201 sound SOUND_SNIPER_ZOOM     "ModelsMP\\Weapons\\Sniper\\Sounds\\Zoom.wav",
206 sound SOUND_SNIPER_QZOOM    "ModelsMP\\Weapons\\Sniper\\Sounds\\QuickZoom.wav",
202 sound SOUND_INFO            "Sounds\\Player\\Info.wav",
203 sound SOUND_WATERAMBIENT    "Sounds\\Player\\Underwater.wav",
204 sound SOUND_WATERBUBBLES    "Sounds\\Player\\Bubbles.wav",
205 sound SOUND_POWERUP_BEEP    "SoundsMP\\Player\\PowerUpBeep.wav",

// ************** FLESH PARTS **************
210 model   MODEL_FLESH          "Models\\Effects\\Debris\\Flesh\\Flesh.mdl",
211 model   MODEL_FLESH_APPLE    "Models\\Effects\\Debris\\Fruits\\Apple.mdl",
212 model   MODEL_FLESH_BANANA   "Models\\Effects\\Debris\\Fruits\\Banana.mdl",
213 model   MODEL_FLESH_BURGER   "Models\\Effects\\Debris\\Fruits\\CheeseBurger.mdl",
214 model   MODEL_FLESH_LOLLY    "Models\\Effects\\Debris\\Fruits\\LollyPop.mdl",
215 model   MODEL_FLESH_ORANGE   "Models\\Effects\\Debris\\Fruits\\Orange.mdl",

220 texture TEXTURE_FLESH_RED    "Models\\Effects\\Debris\\Flesh\\FleshRed.tex",
221 texture TEXTURE_FLESH_GREEN  "Models\\Effects\\Debris\\Flesh\\FleshGreen.tex",
222 texture TEXTURE_FLESH_APPLE  "Models\\Effects\\Debris\\Fruits\\Apple.tex",       
223 texture TEXTURE_FLESH_BANANA "Models\\Effects\\Debris\\Fruits\\Banana.tex",      
224 texture TEXTURE_FLESH_BURGER "Models\\Effects\\Debris\\Fruits\\CheeseBurger.tex",
225 texture TEXTURE_FLESH_LOLLY  "Models\\Effects\\Debris\\Fruits\\LollyPop.tex",
226 texture TEXTURE_FLESH_ORANGE "Models\\Effects\\Debris\\Fruits\\Orange.tex",

// ************** 3D HUD PARTS **************
400 model   MODEL_H3D_BASE       "Models\\Interface\\H3D_BASE.mdl",
403 model   MODEL_H3D_4X4        "Models\\Interface\\H3D_4x4.mdl",
401 model   MODEL_H3D_1X1        "Models\\Interface\\H3D_1x1.mdl",
402 model   MODEL_H3D_07X07      "Models\\Interface\\H3D_07x07.mdl",
404 model   MODEL_H3D_06X06      "Models\\Interface\\H3D_06x06.mdl",

405 model   MODEL_SHOP_MENU_BASE   "Models\\Interface\\SHOP_BASE.mdl",
406 model   MODEL_SHOP_MENU_LONG   "Models\\Interface\\4x1.mdl",
407 model   MODEL_SHOP_MENU_MEDIUM "Models\\Interface\\2x1.mdl",

410 texture TEXTURE_H3D_BASE       "Models\\Interface\\HUD_Test.tex",
411 texture TEXTURE_H3D_ANI        "Models\\Interface\\H3D_ANI.tex",
412 texture TEXTURE_SHOP_BRD       "Models\\Interface\\ShopBordBig.tex",
413 texture TEXTURE_SHOP_ITM       "Models\\Interface\\SHOP_ANI.tex",
414 texture TEXTURE_SHOP_BGD       "Models\\Interface\\ShopSelBIG.tex",
415 texture TEXTURE_SHOP_TIP       "Models\\Interface\\ShopTip.tex",
416 texture TEXTURE_SHOP_COST      "Models\\Interface\\ICost.tex",
417 texture TEXTURE_SHOP_VALUE     "Models\\Interface\\IValue.tex",

418 sound   SOUND_SHOP_BUY         "Sounds\\Shop\\Buy.wav",
419 sound   SOUND_SHOP_ERROR       "Sounds\\Shop\\Error.wav",

/// h3d - shield sounds
420 sound SOUND_SHIELD_HIT      "Sounds\\Player\\ShieldHit.wav",
421 sound SOUND_SHIELD_CHARGE   "Sounds\\Player\\ShieldCharge.wav",
422 sound SOUND_SHIELD_BREAK    "Sounds\\Player\\ShieldBreak.wav",
423 sound SOUND_SHIELD_CHARGED  "Sounds\\Player\\ShieldCharged.wav",

functions:

 void CheckShopInTheWorld(void){
	 m_bShopInTheWorld = FALSE;
	 // Hud 3D - Check for Shop (need for Tab table)
		{FOREACHINDYNAMICCONTAINER(GetWorld()->wo_cenEntities, CEntity, iten) {
		CEntity *pen = iten;
	if(IsOfClass(pen, "Shop")) {
        m_bShopInTheWorld = TRUE;
        break;
	}
	}
	}
 }

  // drop money
  void DropMoney(void) 
  {
	  if (m_iMoney<=0 /*|| m_tmMoneyDropped+0.2f>_pTimer->CurrentTick()*/ || IsPredictor()) {return;}
	CEntityPointer penMoneyItem = CreateEntity(GetPlacement(), CLASS_MONEYITEM);
    CMoneyItem *pmi = (CMoneyItem*)&*penMoneyItem;

	pmi->m_EhitType = m_iMoney>=10? MIT_BAG:MIT_CUSTOM;
	pmi->m_fValue=m_iMoney;
	pmi->m_fCustomRespawnTime=20.0f;
	pmi->m_bDropped=TRUE;
    pmi->CEntity::Initialize();
    
    const FLOATmatrix3D &m = GetRotationMatrix();
    FLOAT3D vSpeed = FLOAT3D( 5.0f, 10.0f, -7.5f);
    pmi->GiveImpulseTranslationAbsolute(vSpeed*m);
	m_iMoney-=m_iMoney>=10?10:m_iMoney;
	m_tmMoneyDropped = _pTimer->CurrentTick();
  }

  void SwitchSpectatorPlayer()  {
	  if (!_pNetwork->IsPlayerLocal(this)) {
		return;
	  }

	do {
      m_iSpectatorPlayerIndex++;
	  if (m_iSpectatorPlayerIndex>=GetMaxPlayers()) {
		  m_iSpectatorPlayerIndex=0;
	  }
      CEntityPointer penPlayer=GetPlayerEntity(m_iSpectatorPlayerIndex);
      if (penPlayer==NULL) {
        continue;
      }
      m_penSpectatorPlayer=penPlayer;
	  if (m_penSpectatorPlayer==this) {
        m_penSpectatorPlayer=NULL;
      }
      break;
    } while (true);
  }

  void CoopRespawn() {

  	// if playing on infinite credits
	if (GetSP()->sp_ctCredits==-1) {
		CPrintF(TRANS("%s is riding the gun again\n"), GetPlayerName());
		SendEvent(EEnd());
		return;
	} 

	// if playing without respawn
	if (GetSP()->sp_ctCredits==0) {
		SwitchSpectatorPlayer();
		return;
	} 

	// if playing on credits
	if (GetSP()->sp_ctCreditsLeft>0) {
		((CSessionProperties*)GetSP())->sp_ctCreditsLeft--;
        // initiate respawn
        CPrintF(TRANS("%s is riding the gun again\n"), GetPlayerName());
		SendEvent(EEnd());

		// report number of credits left
		if (GetSP()->sp_ctCredits>0) {
		  if (GetSP()->sp_ctCreditsLeft==0) {
			CPrintF(TRANS("  no more credits left!\n"));
		  } else {
			CPrintF(TRANS("  %d credits left\n"), GetSP()->sp_ctCreditsLeft);
		  } 
		}
    } else {
		SwitchSpectatorPlayer();
	}
  }

  void ForceSpectate() {
	  m_bSpectatorDeath = TRUE;
	SendEvent(EDeath());
  }


 BOOL IsAmmoFull(INDEX shopItemType) {
   switch (shopItemType) {
    case ITEM_AMMO_SHELLS:
        return GetPlayerWeapons()->m_iShells >= GetPlayerWeapons()->m_iMaxShells;
    case ITEM_AMMO_BULLETS:
        return GetPlayerWeapons()->m_iBullets >= GetPlayerWeapons()->m_iMaxBullets;
    case ITEM_AMMO_ROCKETS:
        return GetPlayerWeapons()->m_iRockets >= GetPlayerWeapons()->m_iMaxRockets;
    case ITEM_AMMO_GRENADES:
        return GetPlayerWeapons()->m_iGrenades >= GetPlayerWeapons()->m_iMaxGrenades;
    case ITEM_AMMO_NAPALM:
        return GetPlayerWeapons()->m_iNapalm >= GetPlayerWeapons()->m_iMaxNapalm;
    case ITEM_AMMO_SNIPERBULLETS:
        return GetPlayerWeapons()->m_iSniperBullets >= GetPlayerWeapons()->m_iMaxSniperBullets;
    case ITEM_AMMO_ELECTRICITY:
        return GetPlayerWeapons()->m_iElectricity >= GetPlayerWeapons()->m_iMaxElectricity;
    case ITEM_AMMO_CANNONBALLS:
        return GetPlayerWeapons()->m_iIronBalls >= GetPlayerWeapons()->m_iMaxIronBalls;
      break;
   }
   return FALSE;
 }


BOOL HasWeapon(INDEX iWeapon) {
    return GetPlayerWeapons()->m_iAvailableWeapons&(1<<(iWeapon-1));
}

BOOL HasShopWeapon(INDEX shopItemType) {
  switch (shopItemType) {
    case ITEM_WPN_CHAINSAW:
      return HasWeapon(WEAPON_CHAINSAW);
    case ITEM_WPN_COLT:
      return HasWeapon(WEAPON_DOUBLECOLT);
    case ITEM_WPN_SINGLESHOTGUN:
      return HasWeapon(WEAPON_SINGLESHOTGUN);
    case ITEM_WPN_DOUBLESHOTGUN:
      return HasWeapon(WEAPON_DOUBLESHOTGUN);
    case ITEM_WPN_TOMMYGUN:
      return HasWeapon(WEAPON_TOMMYGUN);
    case ITEM_WPN_MINIGUN:
      return HasWeapon(WEAPON_MINIGUN);
    case ITEM_WPN_ROCKETLAUNCHER:
      return HasWeapon(WEAPON_ROCKETLAUNCHER);
    case ITEM_WPN_GRENADELAUNCHER:
      return HasWeapon(WEAPON_GRENADELAUNCHER);
    case ITEM_WPN_FLAMER:
      return HasWeapon(WEAPON_FLAMER);
    case ITEM_WPN_SNIPER:
      return HasWeapon(WEAPON_SNIPER);
    case ITEM_WPN_LASER:
      return HasWeapon(WEAPON_LASER);
    case ITEM_WPN_IRONCANNON:
      return HasWeapon(WEAPON_IRONCANNON);
  }

  return FALSE;
}

//to do TRANS
 void BuyItem() {
    CShop* penShop = ((CShop*)&*m_penShop);
    INDEX type = penShop->GetItemType(m_iSelectedShopIndex);
    INDEX value = penShop->GetItemValue(m_iSelectedShopIndex);

    if (HasShopWeapon(type)) {
      PrintCenterMessage(this, this, TRANS("You already have this weapon!"), 3.0f, MSS_INFO);
      PlaySound(m_soMouth, SOUND_SHOP_ERROR, SOF_3D);
      return;
    }
    
    if ((type == ITEM_PLR_HEALTH001 ||
         type == ITEM_PLR_HEALTH100) && GetHealth() >= MaxHealth()) {
       PrintCenterMessage(this, this, TRANS("You have maximum health!"), 3.0f, MSS_INFO);
       PlaySound(m_soMouth, SOUND_SHOP_ERROR, SOF_3D);
       return;
    }
    if ((type == ITEM_PLR_HEALTH010 || 
         type == ITEM_PLR_HEALTH025 ||
         type == ITEM_PLR_HEALTH050) && GetHealth() >= TopHealth()) {
       PrintCenterMessage(this, this, TRANS("You have maximum health!"), 3.0f, MSS_INFO);
       PlaySound(m_soMouth, SOUND_SHOP_ERROR, SOF_3D);
       return;
    }

    if ((type == ITEM_PLR_ARMOR001 ||
         type == ITEM_PLR_ARMOR200) && m_fArmor >= MaxArmor()) {
       PrintCenterMessage(this, this, TRANS("You have maximum armor!"), 3.0f, MSS_INFO);
       PlaySound(m_soMouth, SOUND_SHOP_ERROR, SOF_3D);
       return;
    }
    if ((type == ITEM_PLR_ARMOR005 || 
         type == ITEM_PLR_ARMOR025 || 
         type == ITEM_PLR_ARMOR050 ||
         type == ITEM_PLR_ARMOR100) && m_fArmor >= TopArmor()) {
       PrintCenterMessage(this, this, TRANS("You have maximum armor!"), 3.0f, MSS_INFO);
       PlaySound(m_soMouth, SOUND_SHOP_ERROR, SOF_3D);
       return;
    }

    if ((type == ITEM_PLR_ARMOR005 || 
         type == ITEM_PLR_ARMOR025 || 
         type == ITEM_PLR_ARMOR050 ||
         type == ITEM_PLR_ARMOR100) && m_fArmor >= TopArmor()) {
       PrintCenterMessage(this, this, TRANS("You have maximum armor!"), 3.0f, MSS_INFO);
       PlaySound(m_soMouth, SOUND_SHOP_ERROR, SOF_3D);
       return;
    }

    if (IsAmmoFull(type)) {
       PrintCenterMessage(this, this, TRANS("You have maximum ammo!"), 3.0f, MSS_INFO);
       PlaySound(m_soMouth, SOUND_SHOP_ERROR, SOF_3D);
       return;
    }

    EHealth eHealth;
    EArmor eArmor;
    EAmmoItem eAmmo;
    EMaxShield eMaxShield;

    EWeaponItem eWeapon;
    eWeapon.iAmmo = -1; // use default ammo amount
    eWeapon.bDropped = FALSE;

    switch (penShop->GetItemType(m_iSelectedShopIndex)) {


      case ITEM_WPN_CHAINSAW:
        eWeapon.iWeapon = WIT_CHAINSAW;
        ReceiveItem(eWeapon);
      break;

      case ITEM_WPN_COLT:
        eWeapon.iWeapon = WIT_COLT;
        ReceiveItem(eWeapon);
      break;

      case ITEM_WPN_SINGLESHOTGUN:
        eWeapon.iWeapon = WIT_SINGLESHOTGUN;
        ReceiveItem(eWeapon);
      break;

      case ITEM_WPN_DOUBLESHOTGUN:
        eWeapon.iWeapon = WIT_DOUBLESHOTGUN;
        ReceiveItem(eWeapon);
      break;

      case ITEM_WPN_TOMMYGUN:
        eWeapon.iWeapon = WIT_TOMMYGUN;
        ReceiveItem(eWeapon);
      break;

      case ITEM_WPN_MINIGUN:
        eWeapon.iWeapon = WIT_MINIGUN;
        ReceiveItem(eWeapon);
      break;

      case ITEM_WPN_ROCKETLAUNCHER:
        eWeapon.iWeapon = WIT_ROCKETLAUNCHER;
        ReceiveItem(eWeapon);
      break;

      case ITEM_WPN_GRENADELAUNCHER:
        eWeapon.iWeapon = WIT_GRENADELAUNCHER;
        ReceiveItem(eWeapon);
      break;

      case ITEM_WPN_FLAMER:
        eWeapon.iWeapon = WIT_FLAMER;
        ReceiveItem(eWeapon);
      break;

      case ITEM_WPN_SNIPER:
        eWeapon.iWeapon = WIT_SNIPER;
        ReceiveItem(eWeapon);
      break;

      case ITEM_WPN_LASER:
        eWeapon.iWeapon = WIT_LASER;
        ReceiveItem(eWeapon);
      break;

      case ITEM_WPN_IRONCANNON:
        eWeapon.iWeapon = WIT_CANNON;
        ReceiveItem(eWeapon);
      break;

      case ITEM_PLR_HEALTH001:
        eHealth.fHealth = value;
        eHealth.bOverTopHealth = TRUE;
        ReceiveItem(eHealth);
      break;

      case ITEM_PLR_HEALTH010:
        eHealth.fHealth = value;
        ReceiveItem(eHealth);
      break;

      case ITEM_PLR_HEALTH025:
        eHealth.fHealth = value;
        ReceiveItem(eHealth);
      break;

      case ITEM_PLR_HEALTH050:
        eHealth.fHealth = value;
        ReceiveItem(eHealth);
      break;

      case ITEM_PLR_HEALTH100:
        eHealth.fHealth = value;
        eHealth.bOverTopHealth = TRUE;
        ReceiveItem(eHealth);
      break;

      case ITEM_PLR_ARMOR001:
        eArmor.fArmor = value;
        eArmor.bOverTopArmor = TRUE;
        ReceiveItem(eArmor);
      break;

      case ITEM_PLR_ARMOR005:
        eArmor.fArmor = value;
        ReceiveItem(eArmor);
      break;

      case ITEM_PLR_ARMOR025:
        eArmor.fArmor = value;
        ReceiveItem(eArmor);
      break;

      case ITEM_PLR_ARMOR050:
        eArmor.fArmor = value;
        ReceiveItem(eArmor);
      break;

      case ITEM_PLR_ARMOR100:
        eArmor.fArmor = value;
        ReceiveItem(eArmor);
      break;

      case ITEM_PLR_ARMOR200:
        eArmor.fArmor = value;
        eArmor.bOverTopArmor = TRUE;
        ReceiveItem(eArmor);
      break;

      case ITEM_AMMO_SHELLS:
        eAmmo.EaitType = AIT_SHELLS;
        eAmmo.iQuantity = value;
        ReceiveItem(eAmmo);
      break;

      case ITEM_AMMO_BULLETS:
        eAmmo.EaitType = AIT_BULLETS;
        eAmmo.iQuantity = value;
        ReceiveItem(eAmmo);
      break;

      case ITEM_AMMO_ROCKETS:
        eAmmo.EaitType = AIT_ROCKETS;
        eAmmo.iQuantity = value;
        ReceiveItem(eAmmo);
      break;

      case ITEM_AMMO_GRENADES:
        eAmmo.EaitType = AIT_GRENADES;
        eAmmo.iQuantity = value;
        ReceiveItem(eAmmo);
      break;
      
      case ITEM_AMMO_NAPALM:
        eAmmo.EaitType = AIT_NAPALM;
        eAmmo.iQuantity = value;
        ReceiveItem(eAmmo);
      break;

      case ITEM_AMMO_SNIPERBULLETS:
        eAmmo.EaitType = AIT_SNIPERBULLETS;
        eAmmo.iQuantity = value;
        ReceiveItem(eAmmo);
      break;

      case ITEM_AMMO_ELECTRICITY:
        eAmmo.EaitType = AIT_ELECTRICITY;
        eAmmo.iQuantity = value;
        ReceiveItem(eAmmo);
      break;

      case ITEM_AMMO_CANNONBALLS:
        eAmmo.EaitType = AIT_IRONBALLS;
        eAmmo.iQuantity = value;
        ReceiveItem(eAmmo);
      break;
    }

    m_iMoney -= penShop->GetItemCost(m_iSelectedShopIndex);
    PlaySound(m_soMouth, SOUND_SHOP_BUY, SOF_3D);

 }

PIX2D H3D_Shake( PIX pixAmmount, INDEX iCurrentValue, INDEX iLastValue,
                        TIME tmChanged)
{
  const FLOAT SHAKE_TIME = 2.0f;

  float fMoverX = 0.0f;
  float fMoverY = 0.0f;

  const TIME tmNow = _pTimer->GetLerpedCurrentTick();
  if( iCurrentValue != iLastValue) {
    iLastValue = iCurrentValue;
    tmChanged  = tmNow;
  } else {
    // in case of loading (timer got reseted)
    tmChanged = ClampUp( tmChanged, tmNow);
  }
  
  // no shaker?
  const TIME tmDelta = tmNow - tmChanged;
  if( tmDelta > SHAKE_TIME) { return PIX2D(0,0); }


  ASSERT( tmDelta>=0);
  // shake, baby shake!
  const FLOAT fAmmount    = pixAmmount;
  const FLOAT fMultiplier = (SHAKE_TIME-tmDelta)/SHAKE_TIME *fAmmount;
  const INDEX iRandomizer = (INDEX)(tmNow*511.0f)*fAmmount*iCurrentValue;
  const FLOAT fNormRnd1   = (FLOAT)((iRandomizer ^ (iRandomizer>>9)) & 1023) * 0.0009775f;  // 1/1023 - normalized
  const FLOAT fNormRnd2   = (FLOAT)((iRandomizer ^ (iRandomizer>>7)) & 1023) * 0.0009775f;  // 1/1023 - normalized
  fMoverX = (fNormRnd1 -0.5f) * fMultiplier;
  fMoverY = (fNormRnd2 -0.5f) * fMultiplier;
  // clamp to adjusted ammount (pixels relative to resolution and HUD scale
  fMoverX = Clamp( fMoverX, -fAmmount, fAmmount);
  fMoverY = Clamp( fMoverY, -fAmmount, fAmmount);
 
  
  return PIX2D(fMoverX, fMoverY);
}

// * H3D angle offset *****************************************************************************
void H3DAngleOffset(ANGLE3D &plAngle)
{
	const FLOAT fMaxAngle = 5.0f;

	ANGLE3D aH3DSway = ANGLE3D(0,0,0);
	aH3DSway = Lerp(m_aH3DSwayOld, m_aH3DSway, _pTimer->GetLerpFactor());
	aH3DSway(1) = Clamp(aH3DSway(1), -fMaxAngle, fMaxAngle);
	aH3DSway(2) = Clamp(aH3DSway(2), -fMaxAngle, fMaxAngle);
	plAngle -= aH3DSway;
}
// * END H3D angle offset *************************************************************************

void InitAniNum() {
  // H3D * REFRESH HUD TIME ***********************************************************************
  anCurrentAmmo   = H3D_AniNum(20, 1); //50
  anCurrentHealth = H3D_AniNum(20, 1); //20
  anCurrentArmor  = H3D_AniNum(20, 1); //20

  anCurrentShield = H3D_AniNum(20, 1); //20

  anCurrentScore  = H3D_AniNum(20, 1); //50
  anCurrentFrags  = H3D_AniNum(20, 1); //50
  anCurrentDeaths = H3D_AniNum(20, 1); //50
  anCurrentMoney  = H3D_AniNum(20, 1); //50
  // H3D ******************************************************************************************
}

  void RenderH3D( CPerspectiveProjection3D &prProjection, CDrawPort *pdp,
                          FLOAT3D vViewerLightDirection, COLOR colViewerLight, COLOR colViewerAmbient,
                          BOOL bRender, INDEX iEye)
  {
    CPlacement3D plView;
    plView = en_plViewpoint;
    plView.RelativeToAbsolute(GetPlacement());
      // make sure that h3d will be bright enough *************************************************
    UBYTE ubLR,ubLG,ubLB, ubAR,ubAG,ubAB;
    ColorToRGB( colViewerLight,   ubLR,ubLG,ubLB);
    ColorToRGB( colViewerAmbient, ubAR,ubAG,ubAB);
    INDEX iMinDL = Min( Min(ubLR,ubLG),ubLB) -32;
    INDEX iMinDA = Min( Min(ubAR,ubAG),ubAB) -32;
    if( iMinDL<0) {
      ubLR = ClampUp( ubLR-iMinDL, (INDEX)255);
      ubLG = ClampUp( ubLG-iMinDL, (INDEX)255);
      ubLB = ClampUp( ubLB-iMinDL, (INDEX)255);
    }
    if( iMinDA<0) {
      ubAR = ClampUp( ubAR-iMinDA, (INDEX)255);
      ubAG = ClampUp( ubAG-iMinDA, (INDEX)255);
      ubAB = ClampUp( ubAB-iMinDA, (INDEX)255);
    }
    const COLOR colLight   = RGBToColor( ubLR,ubLG,ubLB);
    const COLOR colAmbient = RGBToColor( ubAR,ubAG,ubAB);

    CRenderModel rmHUD_H3D;
    CPerspectiveProjection3D prMirror3 = prProjection;
    prMirror3.ViewerPlacementL() =  plView;
    prMirror3.FrontClipDistanceL() = h3d_fClip;
    prMirror3.DepthBufferNearL() = 0.0f;
    prMirror3.DepthBufferFarL() = 0.1f;
 
	  FLOAT fH = AngleDeg(h3d_fH);
	  FLOAT fP = AngleDeg(h3d_fP);
	  FLOAT fB = AngleDeg(h3d_fB);

    CPlacement3D plHUD_H3D( FLOAT3D(h3d_fX,
                                    h3d_fY,
                                    h3d_fZ),
							                      ANGLE3D(fH, fP, fB));
    if(h3d_bHudInertia) { H3DAngleOffset(plHUD_H3D.pl_OrientationAngle); }

    FLOATmatrix3D mRotation;
    MakeRotationMatrixFast(mRotation, plView.pl_OrientationAngle);
 
    ((CPerspectiveProjection3D &)prMirror3).FOVL() = AngleDeg(h3d_fFOV);
    CAnyProjection3D apr3;
    apr3 = prMirror3;
    Stereo_AdjustProjection(*apr3, iEye, 0.1f);

    BeginModelRenderingView(apr3, pdp);


    if (GetFlags()&ENF_ALIVE) {
    if(h3d_bHudBobbing) { GetPlayerWeapons()->H3DMovingOffset(plHUD_H3D.pl_PositionVector); }
    }


    if(h3d_bShakingFromDamage) {
      plHUD_H3D.pl_PositionVector += m_vDamageShakeOffset;
    }

    plHUD_H3D.RelativeToAbsoluteSmooth(plView);
    rmHUD_H3D.SetObjectPlacement(plHUD_H3D);
 
    rmHUD_H3D.rm_colLight        = colLight;
    rmHUD_H3D.rm_colAmbient      = colAmbient;
    rmHUD_H3D.rm_vLightDirection = vViewerLightDirection;
    rmHUD_H3D.rm_ulFlags        |= RMF_WEAPON;

	m_moH3D.SetupModelRendering(rmHUD_H3D);
    m_moH3D.RenderModel(rmHUD_H3D);

    if (m_penShop != NULL) {
      m_moShop.SetupModelRendering(rmHUD_H3D);
      m_moShop.RenderModel(rmHUD_H3D);
    }

    EndModelRenderingView();
  }

  void SetGUIShop() {
         SetComponents(this, m_moShop,                                        MODEL_SHOP_MENU_BASE,   TEXTURE_SHOP_BRD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_000_MENU1_BRD,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BRD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_001_MENU1_TXT,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_ITM,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_002_MENU1_SEL,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BGD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_003_MENU2_BRD,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BRD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_004_MENU2_TXT,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_ITM,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_005_MENU2_SEL,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BGD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_006_MENU3_BRD,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BRD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_007_MENU3_TXT,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_ITM,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_008_MENU3_SEL,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BGD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_009_MENU4_BRD,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BRD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_010_MENU4_TXT,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_ITM,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_011_MENU4_SEL,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BGD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_012_MENU5_BRD,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BRD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_013_MENU5_TXT,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_ITM,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_014_MENU5_SEL,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BGD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_015_MENU6_BRD,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BRD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_016_MENU6_TXT,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_ITM,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_017_MENU6_SEL,    MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BGD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_018_BORDER_COST,  MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BRD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_019_ICON_COST,    MODEL_H3D_06X06,        TEXTURE_SHOP_COST,   0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_020_DGTCST10000,  MODEL_H3D_06X06,        TEXTURE_H3D_ANI,     0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_021_DGTCST01000,  MODEL_H3D_06X06,        TEXTURE_H3D_ANI,     0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_022_DGTCST00100,  MODEL_H3D_06X06,        TEXTURE_H3D_ANI,     0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_023_DGTCST00010,  MODEL_H3D_06X06,        TEXTURE_H3D_ANI,     0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_024_DGTCST00001,  MODEL_H3D_06X06,        TEXTURE_H3D_ANI,     0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_025_BORDER_VALUE, MODEL_SHOP_MENU_LONG,   TEXTURE_SHOP_BRD,    0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_026_ICON_VALUE,   MODEL_H3D_06X06,        TEXTURE_SHOP_VALUE,  0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_027_DGTVLU100,    MODEL_H3D_06X06,        TEXTURE_H3D_ANI,     0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_028_DGTVLU010,    MODEL_H3D_06X06,        TEXTURE_H3D_ANI,     0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_029_DGTVLU001,    MODEL_H3D_06X06,        TEXTURE_H3D_ANI,     0, 0, 0);
	AddAttachmentToModel(this, m_moShop, SHOP_BASE_ATTACHMENT_030_TIP,          MODEL_SHOP_MENU_MEDIUM, TEXTURE_SHOP_TIP,    0, 0, 0);


    for (INDEX bgrIndex = 0, i = 2; bgrIndex < 6; i+=3, bgrIndex++) {
     CModelObject &background = m_moShop.GetAttachmentModel(i)->amo_moModelObject;
     background.mo_colBlendColor = h3d_iColor|255;
    }
    CModelObject &borderCost  = m_moShop.GetAttachmentModel(SHOP_BASE_ATTACHMENT_018_BORDER_COST)->amo_moModelObject;  borderCost.mo_colBlendColor  = h3d_iColor|255;
    CModelObject &borderValue = m_moShop.GetAttachmentModel(SHOP_BASE_ATTACHMENT_025_BORDER_VALUE)->amo_moModelObject; borderValue.mo_colBlendColor = h3d_iColor|255;
    CModelObject &tip         = m_moShop.GetAttachmentModel(SHOP_BASE_ATTACHMENT_030_TIP)->amo_moModelObject;          tip.mo_colBlendColor         = h3d_iColor|255;
  }

  void UpdateGUIShop() {
    CShop* penShop = ((CShop*)&*m_penShop);

    // set shop stuff icons
    for (INDEX i = 1, itemIndex = 0; itemIndex < 6; i+=3, itemIndex++) {
      CModelObject &textBar = m_moShop.GetAttachmentModel(i)->amo_moModelObject;
      INDEX itemType = penShop->GetItemType(itemIndex)-1;
        textBar.mo_colBlendColor = C_WHITE|255;

      if (itemType == -1) {
        textBar.mo_colBlendColor = C_WHITE|0;
        continue;
      }
      textBar.mo_toTexture.PlayAnim(itemType, 0);
    }
    // set selection border
        {
      BOOL isZero = TRUE;
      for (INDEX i = 24, itemIndex=0; i >= 20; i--, itemIndex++) {
        int multiplier = pow(10, itemIndex);
        INDEX iItemCost = penShop->GetItemCost(m_iSelectedShopIndex);
        INDEX iNumCst      = (iItemCost % (10*multiplier)) / multiplier;
        CModelObject &digit = m_moShop.GetAttachmentModel(i)->amo_moModelObject; digit.mo_toTexture.PlayAnim(iNumCst+113, 0);

        if (iItemCost == 0) {
          if (i != 24) {
            digit.mo_toTexture.PlayAnim(124, 0);
          } else if (i==24) {
            digit.mo_toTexture.PlayAnim(113, 0);
          }
          continue;
        }

        if (iNumCst==0 && !isZero) {
          digit.mo_toTexture.PlayAnim(124, 0);
        } else if (iNumCst != 0) {
          isZero = FALSE;
        }

      }
    }
      
    {
      for (INDEX i = 0, borderIndex = 0; borderIndex < 6; i+=3, borderIndex++) {
        CModelObject &bordBar = m_moShop.GetAttachmentModel(i)->amo_moModelObject;

        bordBar.mo_colBlendColor = h3d_iColor|0;
        if (m_iSelectedShopIndex == borderIndex) {
          bordBar.mo_colBlendColor = C_WHITE|255;
        }
      }
    }
    //const INDEX ANIM_INVISIBLE_ZERO = 123;
    /*
    // read item cost
    {
      BOOL isZero = TRUE;
      for (INDEX i = 24, itemIndex=0; i >= 20; i--, itemIndex++) {
        int multiplier = pow(10, itemIndex);
        INDEX iNumCst      = (penShop->GetItemCost(m_iSelectedShopIndex) % (1000*multiplier)) / (100*multiplier);
        CModelObject &digit = m_moShop.GetAttachmentModel(i)->amo_moModelObject; digit.mo_toTexture.PlayAnim(iNumCst+112, 0);

        if (iNumCst==0 && !isZero) {
          digit.mo_toTexture.PlayAnim(ANIM_INVISIBLE_ZERO, 0);
        } else if (iNumCst != 0) {
          isZero = FALSE;
        }
      }
    }*/


    // read item value
    {
      BOOL isZero = TRUE;
      for (INDEX i = 29, itemIndex=0; i >= 27; i--, itemIndex++) {
        int multiplier = pow(10, itemIndex);
        INDEX iItemValue = penShop->GetItemValue(m_iSelectedShopIndex);
        INDEX iNumCst      = (iItemValue % (10*multiplier)) / multiplier;
        CModelObject &digit = m_moShop.GetAttachmentModel(i)->amo_moModelObject; digit.mo_toTexture.PlayAnim(iNumCst+113, 0);

        if (iItemValue == 0) {
          if (i != 29) {
            digit.mo_toTexture.PlayAnim(124, 0);
          } else if (i==29) {
            digit.mo_toTexture.PlayAnim(113, 0);
          }
          continue;
        }

        if (iNumCst==0 && !isZero) {
          digit.mo_toTexture.PlayAnim(124, 0);
        } else if (iNumCst != 0) {
          isZero = FALSE;
        }

      }
    }

  }

  void SetHUD() {

	SetComponents		    (this, m_moH3D,                                                         MODEL_H3D_BASE,  TEXTURE_H3D_BASE, 0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_000_ICO_HEALTH,                     MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_001_DGT_HEALTH_100,                 MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_002_DGT_HEALTH_010,                 MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_003_DGT_HEALTH_001,                 MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_004_ICO_ARMOR,                      MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_005_DGT_ARMOR_100,                  MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_006_DGT_ARMOR_010,                  MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_007_DGT_ARMOR_001,                  MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_008_ICO_SHIELD,                     MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_009_DGT_SHIELD_100,                 MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_010_DGT_SHIELD_010,                 MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_011_DGT_SHIELD_001,                 MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_012_ICO_SCORE,                      MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_013_DGT_SCORE_100000,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_014_DGT_SCORE_010000,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_015_DGT_SCORE_001000,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_016_DGT_SCORE_000100,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_017_DGT_SCORE_000010,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_018_DGT_SCORE_000001,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_019_DOT_SCORE,                      MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_020_ICO_SKULL,                      MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_021_DGT_DEATH_100000,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_022_DGT_DEATH_010000,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_023_DGT_DEATH_001000,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_024_DGT_DEATH_000100,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_025_DGT_DEATH_000010,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_026_DGT_DEATH_000001,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_027_ICO_EXTRALIFE,                  MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_028_DGT_EXTRALIFE_10,               MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_029_DGT_EXTRALIFE_01,               MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_030_ICO_SERIOUSDAMAGE,              MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_031_BAR_SERIOUSDAMAGE,              MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_032_ICO_INVULNERABILITY,            MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_033_BAR_INVULNERABILITY,            MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_034_ICO_SERIOUSSPEED,               MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_035_BAR_SERIOUSSPEED,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_036_ICO_INVISIBILITY,               MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_037_BAR_INVISIBILITY,               MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_038_DGT_CURRENTAMMO_100,            MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_039_DGT_CURRENTAMMO_010,            MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_040_DGT_CURRENTAMMO_001,            MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_041_ICO_MESSAGE,                    MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_042_DGT_MESSAGE_100,                MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_043_DGT_MESSAGE_010,                MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_044_DGT_MESSAGE_001,                MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_045_ICO_BOSSHEALTH,                 MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_046_DGT_BOSSHEALTH_100,             MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_047_DGT_BOSSHEALTH_010,             MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_048_DGT_BOSSHEALTH_001,             MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_049_ICO_OXYGEN,                     MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_050_DGT_OXYGEN_10,                  MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_051_DGT_OXYGEN_01,                  MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_052_ICO_SHELLS,                     MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_053_BAR_SHELLS,                     MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_054_BRD_SHELLS,                     MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_055_ICO_BULLETS,                    MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_056_BAR_BULLETS,                    MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_057_BRD_BULLETS,                    MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_058_ICO_ROCKETS,                    MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_059_BAR_ROCKETS,                    MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_060_BRD_ROCKETS,                    MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_061_ICO_GRENADES,                   MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_062_BAR_GRENADES,                   MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_063_BRD_GRENADES,                   MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_064_ICO_FUEL,                       MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_065_BAR_FUEL,                       MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_066_BRD_FUEL,                       MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_067_ICO_SNIPERBULLETS,              MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_068_BAR_SNIPERBULLETS,              MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_069_BRD_SNIPERBULLETS,              MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_070_ICO_ELECTRICITY,                MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_071_BAR_ELECTRICITY,                MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_072_BRD_ELECTRICITY,                MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_073_ICO_IRONBALL,                   MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_074_BAR_IRONBALL,                   MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_075_BRD_IRONBALL,                   MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_076_ICO_SERIOUSBOMB,                MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_077_BAR_SERIOUSBOMB,                MODEL_H3D_06X06, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_078_ICO_KNIFE,                      MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_079_BRD_KNIFE,                      MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_080_ICO_CHAINSAW,                   MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_081_BRD_CHAINSAW,                   MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_082_ICO_COLT,                       MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_083_BRD_COLT,                       MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_084_ICO_DOUBLECOLT,                 MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_085_BRD_DOUBLECOLT,                 MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_086_ICO_SHOTGUN,                    MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_087_BRD_SHOTGUN,                    MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_088_ICO_DOUBLESHOTGUN,              MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_089_BRD_DOUBLESHOTGUN,              MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_090_ICO_TOMMYGUN,                   MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_091_BRD_TOMMYGUN,                   MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_092_ICO_MINIGUN,                    MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_093_BRD_MINIGUN,                    MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_094_ICO_ROCKETLAUNCHER,             MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_095_BRD_ROCKETLAUNCHER,             MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_096_ICO_GRENADELAUNCHER,            MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_097_BRD_GRENADELAUNCHER,            MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_098_ICO_FLAMETHROWER,               MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_099_BRD_FLAMETHROWER,               MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_100_ICO_SNIPERRIFLE,                MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_101_BRD_SNIPERRIFLE,                MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_102_ICO_LASER,                      MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_103_BRD_LASER,                      MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_104_ICO_CANNON,                     MODEL_H3D_07X07, TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_105_BRD_CANNON,                     MODEL_H3D_1X1,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_106_BORDER_HEALTH,                  MODEL_H3D_4X4,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_107_BORDER_ARMOR,                   MODEL_H3D_4X4,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_108_BORDER_SHIELD,                  MODEL_H3D_4X4,   TEXTURE_H3D_ANI,  0, 0, 0);
	AddAttachmentToModel(this, m_moH3D, H3D_BASE_ATTACHMENT_109_BORDER_AMMO,                    MODEL_H3D_4X4,   TEXTURE_H3D_ANI,  0, 0, 0);
        

  SetGUIShop();

  for (int i = 0; i < 110; i++) {
    h3d_OriginalAttachmentPositions[i] = m_moH3D.GetAttachmentModel(i)->amo_plRelative.pl_PositionVector(2);
  }

  m_aWeaponSway = ANGLE3D(0,0,0);
  m_aWeaponSwayOld = ANGLE3D(0,0,0);
  m_aH3DSway = ANGLE3D(0,0,0);
  m_aH3DSwayOld = ANGLE3D(0,0,0);
  m_bWalking = FALSE;
  }

  INDEX GetCurrentWeaponAmmo() {
	  switch (GetPlayerWeapons()->m_iCurrentWeapon) {
		case WEAPON_KNIFE: 
		case WEAPON_CHAINSAW:  
			return -1;


		case WEAPON_COLT: 
			return GetPlayerWeapons()->m_iColtBullets;

		case WEAPON_DOUBLECOLT:
			return GetPlayerWeapons()->m_iColtBullets*2;

		case WEAPON_SINGLESHOTGUN: 
		case WEAPON_DOUBLESHOTGUN: 
			return GetPlayerWeapons()->m_iShells;
		
		case WEAPON_TOMMYGUN:
		case WEAPON_MINIGUN:
			return GetPlayerWeapons()->m_iBullets;

		case WEAPON_ROCKETLAUNCHER:
			return GetPlayerWeapons()->m_iRockets;

	  case WEAPON_GRENADELAUNCHER:
      return GetPlayerWeapons()->m_iGrenades;

		case WEAPON_FLAMER:
			return GetPlayerWeapons()->m_iNapalm;

		case WEAPON_SNIPER:
			return GetPlayerWeapons()->m_iSniperBullets;

		case WEAPON_LASER:
			return GetPlayerWeapons()->m_iElectricity;

		case WEAPON_IRONCANNON:
			return GetPlayerWeapons()->m_iIronBalls;

	  }
	  return -1;
  }
    
    // * 3D HUD * SWITCH DIGITS *******************************************************************

  void UpdateHUD() {

    // NOTE THAT h3d_OriginalAttachmentPositions LENGTH MUST BE UPDATED WHEN NEW ATTACHMENT

    int i = 0;
    // position for wide screen
    for (i = 0;   i <= 11; i++)  {    CAttachmentModelObject* amo = m_moH3D.GetAttachmentModel(i);
      amo->amo_plRelative.pl_PositionVector(2) = h3d_OriginalAttachmentPositions[i] + h3d_fVerticalPlacementHUD;    }

    for (i = 30;  i <= 40; i++)  {    CAttachmentModelObject* amo = m_moH3D.GetAttachmentModel(i);
      amo->amo_plRelative.pl_PositionVector(2) = h3d_OriginalAttachmentPositions[i] + h3d_fVerticalPlacementHUD;    }

    for (i = 52;  i <= 77; i++)  {    CAttachmentModelObject* amo = m_moH3D.GetAttachmentModel(i);
      amo->amo_plRelative.pl_PositionVector(2) = h3d_OriginalAttachmentPositions[i] + h3d_fVerticalPlacementHUD;    }

    for (i = 106; i <= 109; i++) {    CAttachmentModelObject* amo = m_moH3D.GetAttachmentModel(i);
      amo->amo_plRelative.pl_PositionVector(2) = h3d_OriginalAttachmentPositions[i] + h3d_fVerticalPlacementHUD;    }

    for (i = 12;  i <= 26; i++)  {    CAttachmentModelObject* amo = m_moH3D.GetAttachmentModel(i);
      amo->amo_plRelative.pl_PositionVector(2) = h3d_OriginalAttachmentPositions[i] - h3d_fVerticalPlacementHUD;    }

    for (i = 41;  i <= 51; i++)  {    CAttachmentModelObject* amo = m_moH3D.GetAttachmentModel(i);
      amo->amo_plRelative.pl_PositionVector(2) = h3d_OriginalAttachmentPositions[i] - h3d_fVerticalPlacementHUD;    }

		  INDEX H3DC_DIS   = 0x33333300;
		  INDEX H3DC_WHITE = 0xFFFFFF00;
		  INDEX H3DC_GREEN = 0x00FF0000;
		  INDEX H3DC_RED   = 0xFF000000;

	    //FLOAT iGetCount  = 0;
		  //FLOAT iMaxCount  = 0;
		  INDEX iCount     = 0;
		  INDEX iCountType = 0;
		  //FLOAT fNormValue = 0;
		  FLOAT _tmNow     = _pTimer->CurrentTick();

      GetHPType(iCountType, iCount);

  	  INDEX GetCurrentAmmo = 0;
		  INDEX GetWantedWeapon = 0;
		   switch (GetPlayerWeapons()->m_iWantedWeapon) {
		  case WEAPON_KNIFE:
			 GetWantedWeapon =  1; break;
			case WEAPON_CHAINSAW:
			 GetWantedWeapon =  2; break;
			case WEAPON_COLT:
			 GetWantedWeapon =  3; break;
			case WEAPON_DOUBLECOLT:
			 GetWantedWeapon =  4; break;
			case WEAPON_SINGLESHOTGUN:
			 GetWantedWeapon =  5; break;
			case WEAPON_DOUBLESHOTGUN:
			 GetWantedWeapon =  6; break;
			case WEAPON_TOMMYGUN:
			 GetWantedWeapon =  7; break;
			case WEAPON_MINIGUN:
			 GetWantedWeapon =  8; break;
			case WEAPON_ROCKETLAUNCHER:
			 GetWantedWeapon =  9; break;
			case WEAPON_GRENADELAUNCHER:
			 GetWantedWeapon = 10; break;
			case WEAPON_FLAMER:
			 GetWantedWeapon = 11; break;
			case WEAPON_SNIPER:
			 GetWantedWeapon = 12; break;
			case WEAPON_LASER:
			 GetWantedWeapon = 13; break;
			case WEAPON_IRONCANNON:
			 GetWantedWeapon = 14; break;
			default: GetWantedWeapon = 0;
		   }
      switch (GetPlayerWeapons()->m_iCurrentWeapon) {
        case WEAPON_KNIFE:
        case WEAPON_CHAINSAW:
        case WEAPON_COLT:
        case WEAPON_DOUBLECOLT:
          GetCurrentAmmo = 0; break;
        case WEAPON_SINGLESHOTGUN:
          GetCurrentAmmo = 1; break;
        case WEAPON_DOUBLESHOTGUN:
          GetCurrentAmmo = 1; break;
        case WEAPON_TOMMYGUN:
          GetCurrentAmmo = 2; break;
        case WEAPON_MINIGUN:
          GetCurrentAmmo = 2; break;
        case WEAPON_ROCKETLAUNCHER:
          GetCurrentAmmo = 3; break;
        case WEAPON_GRENADELAUNCHER:
          GetCurrentAmmo = 4; break;
        case WEAPON_FLAMER:
          GetCurrentAmmo = 5; break;
        case WEAPON_SNIPER:
          GetCurrentAmmo = 6; break;
        case WEAPON_LASER:
          GetCurrentAmmo = 7; break;
        case WEAPON_IRONCANNON:
          GetCurrentAmmo = 8; break;
        default: GetCurrentAmmo = 0;
      }

      anCurrentHealth.iTo = ceil(GetHealth());
      anCurrentArmor.iTo  = ceil(m_fArmor);

      anCurrentShield.iTo  = ceil(m_fShield);

      anCurrentScore.iTo  = ceil(m_psGameStats.ps_iScore);
      anCurrentFrags.iTo  = ceil(m_psGameStats.ps_iKills);
      anCurrentDeaths.iTo = ceil(m_psGameStats.ps_iDeaths);
      anCurrentMana.iTo   = m_iMana;
      anCurrentMoney.iTo  = m_iMoney;
      anCurrentAmmo.iTo   = GetCurrentWeaponAmmo();

	  	  // set these values instantly
      anCurrentMana.iCurrent   = anCurrentMana.iTo;
      anCurrentFrags.iCurrent  = anCurrentFrags.iTo;
      anCurrentDeaths.iCurrent = anCurrentDeaths.iTo;
      
      if (GetSP()->sp_bSinglePlayer) {    //change digits show style
        UpdateAniNum(anCurrentHealth);    //one digit in SP
        UpdateAniNum(anCurrentArmor);

		UpdateAniNum(anCurrentShield);

      } else {
        UpdateAniDigits(anCurrentHealth); //all digits in MP
        UpdateAniDigits(anCurrentArmor);

		UpdateAniDigits(anCurrentShield);

        UpdateAniDigits(anCurrentFrags);
        UpdateAniDigits(anCurrentDeaths);
        UpdateAniDigits(anCurrentMana);
      }

      UpdateAniDigits(anCurrentAmmo);
      UpdateAniDigits(anCurrentScore);
	  UpdateAniNum(anCurrentMoney);

	  // TODO: change variable names

	  // naimenovaniya s bolshoou bukvi - eto naimenovaniya classov, naprimer EnemyBase
	  // local variable: iPlayerHealth
	  // global variable: m_iPlayerHealth
	  // a tut prosto PlayerHealth. K kakoi oblasti ona prinadlezhit - skazat nevozmojno
      
    INDEX PlayerHealth    = ceil(anCurrentHealth.iCurrent);
    INDEX PlayerArmor     = ceil(anCurrentArmor.iCurrent);

    INDEX PlayerShield    = ceil(anCurrentShield.iCurrent);

    INDEX PlayerScore     = anCurrentScore.iCurrent;
    INDEX iAbsPlayerScore = abs(anCurrentScore.iCurrent);
    INDEX PlayerMana      = anCurrentMana.iCurrent;
    INDEX iAbsPlayerFrags = abs(anCurrentFrags.iCurrent);
    INDEX PlayerFrags     = anCurrentFrags.iCurrent;
    INDEX PlayerDeaths    = anCurrentDeaths.iCurrent;
    INDEX iCurAmm         = anCurrentAmmo.iCurrent;
    INDEX iMoney          = anCurrentMoney.iCurrent;

    INDEX PlayerPwUpSD = ceil(m_tmSeriousDamage   - _pTimer->CurrentTick());
    INDEX PlayerPwUpIU = ceil(m_tmInvulnerability - _pTimer->CurrentTick());
    INDEX PlayerPwUpSS = ceil(m_tmSeriousSpeed    - _pTimer->CurrentTick());
    INDEX PlayerPwUpIS = ceil(m_tmInvisibility    - _pTimer->CurrentTick());

    INDEX iCurAmmBrd       = GetCurrentAmmo;
    INDEX iWntWep          = GetWantedWeapon;
    INDEX iMessages        = m_ctUnreadMessages;
    INDEX iOxygen          = en_tmMaxHoldBreath - (_pTimer->CurrentTick() - en_tmLastBreathed);
    INDEX iInfAmm          = GetSP()->sp_bInfiniteAmmo;
    INDEX iDeathDigitAlpha = 255;
    FLOAT fHudAppear       = 0.0f;

	  if (GetStatsInGameTimeGame()<1.0f){
		  fHudAppear=0.0f;
	  } else if (GetStatsInGameTimeGame()>1.5f){
		  fHudAppear=1.0f;
	  } else {
      fHudAppear=(GetStatsInGameTimeGame()-1.0f)/0.5f;
	  }
	  INDEX iCurrentAlpha = 255*fHudAppear;
	  INDEX iIAAlpha     = iCurrentAlpha;
	  if (iInfAmm) {iIAAlpha = 0;} //Hide ammo if Infinity Ammo is enabled

    INDEX iAvbWep      = GetPlayerWeapons()->m_iAvailableWeapons;
		  
    INDEX iNumHl1      = (PlayerHealth%1000)/100;
    INDEX iNumHl2      = (PlayerHealth%100)/10;
    INDEX iNumHl3      = PlayerHealth%10;
    INDEX iIcoHlt      = 13;
    FLOAT m_fBrdHlth   = 0.0f;

    INDEX iHealthBorderAlpha = 0;

    FLOAT fHudAppearDiff = m_fBorderHealth - _tmNow;
    if (m_fBorderHealth > _tmNow) { iHealthBorderAlpha = 255/(m_h3dAppearTime/fHudAppearDiff); } else { m_h3dAppearTime = 0; }

    INDEX iNumAr1      = (PlayerArmor%1000)/100;
    INDEX iNumAr2      = (PlayerArmor%100)/10;
    INDEX iNumAr3      = PlayerArmor%10;
    INDEX iIcoArr      = 16;
    INDEX iBrdArmr     = 0;

    FLOAT fHudAppearDiffArmor = m_fBorderArmor - _tmNow;
    if (m_fBorderArmor > _tmNow) { iBrdArmr = 255/(m_h3dAppearTimeArmor/fHudAppearDiffArmor); } else { m_h3dAppearTimeArmor = 0; }

    INDEX iNumShield1  = (PlayerShield%1000)/100;
    INDEX iNumShield2  = (PlayerShield%100)/10;
    INDEX iNumShield3  = PlayerShield%10;
    INDEX iIcoShield   = 126;
    INDEX iShieldBorderAlpha = 0;

    FLOAT fHudAppearDiffShield = m_fBorderShield - _tmNow;
    if (m_fBorderShield > _tmNow) { iShieldBorderAlpha = 255/(m_h3dAppearTimeShield/fHudAppearDiffShield); } else { m_h3dAppearTimeShield = 0; }

      INDEX iNumSc1;
      INDEX iNumSc2;
      INDEX iNumSc3;
      INDEX iNumSc4;
      INDEX iNumSc5;
      INDEX iNumSc6;
      INDEX iDotScr;
  
      if (PlayerScore<999999) {
      iNumSc1 = (PlayerScore%1000000)/100000;
      iNumSc2 = (PlayerScore%100000)/10000;
      iNumSc3 = (PlayerScore%10000)/1000;
      iNumSc4 = (PlayerScore%1000)/100;
      iNumSc5 = (PlayerScore%100)/10;
      iNumSc6 = PlayerScore%10;
      iDotScr = 129;
      } else {
      iNumSc1 = (PlayerScore%100000000)/10000000;
      iNumSc2 = (PlayerScore%10000000)/1000000;
      iNumSc3 = (PlayerScore%1000000)/100000;
      iNumSc4 = (PlayerScore%100000)/10000;
      iNumSc5 = (PlayerScore%10000)/1000;
      iNumSc6 = (PlayerScore%1000)/100;
      iDotScr = 130;
      }

    INDEX iIcoScr      = 25;

    INDEX iNumDmSc1    = (iAbsPlayerScore%1000000)/100000;
    INDEX iNumDmSc2    = (iAbsPlayerScore%100000)/10000;
    INDEX iNumDmSc3    = (iAbsPlayerScore%10000)/1000;
    INDEX iNumDmSc4    = (iAbsPlayerScore%1000)/100;
    INDEX iNumDmSc5    = (iAbsPlayerScore%100)/10;
    INDEX iNumDmSc6    =  iAbsPlayerScore%10;

    INDEX iNumFr1      = ((abs(PlayerFrags))%1000000)/100000;
    INDEX iNumFr2      = ((abs(PlayerFrags))%100000)/10000;
    INDEX iNumFr3      = ((abs(PlayerFrags))%10000)/1000;
    INDEX iNumFr4      = ((abs(PlayerFrags))%1000)/100;
    INDEX iNumFr5      = ((abs(PlayerFrags))%100)/10;
    INDEX iNumFr6      =  (abs(PlayerFrags))%10;

    INDEX iIcoFrg      = 100;

    INDEX iNumDt1      = (PlayerDeaths%1000000)/100000;
    INDEX iNumDt2      = (PlayerDeaths%100000)/10000;
    INDEX iNumDt3      = (PlayerDeaths%10000)/1000;
    INDEX iNumDt4      = (PlayerDeaths%1000)/100;
    INDEX iNumDt5      = (PlayerDeaths%100)/10;
    INDEX iNumDt6      =  PlayerDeaths%10;

    INDEX iIcoDth      = 24;

    INDEX iNumMn1      = (PlayerMana%1000000)/100000;
    INDEX iNumMn2      = (PlayerMana%100000)/10000;
    INDEX iNumMn3      = (PlayerMana%10000)/1000;
    INDEX iNumMn4      = (PlayerMana%1000)/100;
    INDEX iNumMn5      = (PlayerMana%100)/10;
    INDEX iNumMn6      =  PlayerMana%10;

    INDEX iIcoMan      = 24;

    INDEX iNumMoney1   = (iMoney%1000000)/100000;
    INDEX iNumMoney2   = (iMoney%100000)/10000;
    INDEX iNumMoney3   = (iMoney%10000)/1000;
    INDEX iNumMoney4   = (iMoney%1000)/100;
    INDEX iNumMoney5   = (iMoney%100)/10;
    INDEX iNumMoney6   =  iMoney%10;

    INDEX iIcoMoney    = 25;

    INDEX iNumExtra    = GetSP()->sp_ctCreditsLeft;
    INDEX iNumExtra1   = (GetSP()->sp_ctCreditsLeft%100)/10;
    INDEX iNumExtra2   = GetSP()->sp_ctCreditsLeft%10;
    INDEX iIcoExtra    = 131;

    FLOAT fTimerSeriousDamage   = (m_tmSeriousDamage-_pTimer->CurrentTick())   / m_tmSeriousDamageMax;   INDEX iIcoPUSD = 26; INDEX iBarSeriousDamage   = 62;
    FLOAT fTimerInvulnerability = (m_tmInvulnerability-_pTimer->CurrentTick()) / m_tmInvulnerabilityMax; INDEX iIcoPUIU = 29; INDEX iBarInvulnerability = 62;
    FLOAT fTimerSeriousSpeed    = (m_tmSeriousSpeed-_pTimer->CurrentTick())    / m_tmSeriousSpeedMax;    INDEX iIcoPUSS = 32; INDEX iBarSeriousSpeed    = 62;
    FLOAT fTimerInvisibility    = (m_tmInvisibility-_pTimer->CurrentTick())    / m_tmInvisibilityMax;    INDEX iIcoPUIS = 35; INDEX iBarInvisibility    = 62;

    INDEX iNumAm1      = (iCurAmm%1000)/100;
    INDEX iNumAm2      = (iCurAmm%100)/10;
    INDEX iNumAm3      = iCurAmm%10;
    INDEX iBrdAmmo     = 0;

    INDEX iNumMsg1     = ((iMessages%1000)/100)+1;
    INDEX iNumMsg2     = ((iMessages%100)/10)+1;
    INDEX iNumMsg3     = (iMessages%10)+1;
    INDEX iIcoMsg      = 37;

    INDEX iNumCnt1     = ((iCount%1000)/100)+1;
    INDEX iNumCnt2     = ((iCount%100)/10)+1;
    INDEX iNumCnt3     = (iCount%10)+1;
    INDEX iIcoCnt      = 13;

    INDEX iNumOxy1     = ((iOxygen%100)/10)+1;
    INDEX iNumOxy2     = (iOxygen%10)+1;
    INDEX iIcoOxy      = 41;

    INDEX iShls        = GetPlayerWeapons()->m_iShells;        INDEX iMaxShls     = GetPlayerWeapons()->m_iMaxShells;
    INDEX iBlts        = GetPlayerWeapons()->m_iBullets;       INDEX iMaxBlts     = GetPlayerWeapons()->m_iMaxBullets;
    INDEX iRckt        = GetPlayerWeapons()->m_iRockets;       INDEX iMaxRckt     = GetPlayerWeapons()->m_iMaxRockets;
    INDEX iGrnd        = GetPlayerWeapons()->m_iGrenades;      INDEX iMaxGrnd     = GetPlayerWeapons()->m_iMaxGrenades;
    INDEX iNplm        = GetPlayerWeapons()->m_iNapalm;        INDEX iMaxNplm     = GetPlayerWeapons()->m_iMaxNapalm;
    INDEX iSnbl        = GetPlayerWeapons()->m_iSniperBullets; INDEX iMaxSnbl     = GetPlayerWeapons()->m_iMaxSniperBullets;
    INDEX iElec        = GetPlayerWeapons()->m_iElectricity;   INDEX iMaxElec     = GetPlayerWeapons()->m_iMaxElectricity;
    INDEX iIrbl        = GetPlayerWeapons()->m_iIronBalls;     INDEX iMaxIrbl     = GetPlayerWeapons()->m_iMaxIronBalls;
    INDEX iSrbm        = m_iSeriousBombCount;

    FLOAT fGetAmmShl   = (FLOAT)iShls / (FLOAT)iMaxShls; INDEX iIcoShl = 44; INDEX iBarShl = 62; INDEX iBrdShl = 67;
    FLOAT fGetAmmBlt   = (FLOAT)iBlts / (FLOAT)iMaxBlts; INDEX iIcoBlt = 46; INDEX iBarBlt = 62; INDEX iBrdBlt = 67;
	  FLOAT fGetAmmRkt   = (FLOAT)iRckt / (FLOAT)iMaxRckt; INDEX iIcoRkt = 48; INDEX iBarRkt = 62; INDEX iBrdRkt = 67;
	  FLOAT fGetAmmGrd   = (FLOAT)iGrnd / (FLOAT)iMaxGrnd; INDEX iIcoGrd = 50; INDEX iBarGrd = 62; INDEX iBrdGrd = 67;
	  FLOAT fGetAmmNpl   = (FLOAT)iNplm / (FLOAT)iMaxNplm; INDEX iIcoNpl = 52; INDEX iBarNpl = 62; INDEX iBrdNpl = 67;
	  FLOAT fGetAmmSbl   = (FLOAT)iSnbl / (FLOAT)iMaxSnbl; INDEX iIcoSbl = 54; INDEX iBarSbl = 62; INDEX iBrdSbl = 67;
	  FLOAT fGetAmmElc   = (FLOAT)iElec / (FLOAT)iMaxElec; INDEX iIcoElc = 56; INDEX iBarElc = 62; INDEX iBrdElc = 67;
	  FLOAT fGetAmmIrb   = (FLOAT)iIrbl / (FLOAT)iMaxIrbl; INDEX iIcoIrb = 58; INDEX iBarIrb = 62; INDEX iBrdIrb = 67;
		                                                         
	  INDEX iIcoSrb = 60; INDEX iBarSrb = 62;
	    
	  INDEX iWntWepKnf   = 67; INDEX iWntWepChs   = 67;    
	  INDEX iWntWepClt   = 67; INDEX iWntWepDcl   = 67;    
	  INDEX iWntWepSht   = 67; INDEX iWntWepDsh   = 67;    
	  INDEX iWntWepTmg   = 67; INDEX iWntWepMgn   = 67;    
	  INDEX iWntWepRkl   = 67; INDEX iWntWepGrl   = 67;    
	  INDEX iWntWepFlm   = 67; INDEX iWntWepSnp   = 67;    
	  INDEX iWntWepLsr   = 67; INDEX iWntWepCnn   = 67;    

	  INDEX iAvbWepKnf   = 69; INDEX iAvbWepChs   = 71;
	  INDEX iAvbWepClt   = 73; INDEX iAvbWepDcl   = 75;
	  INDEX iAvbWepSht   = 77; INDEX iAvbWepDsh   = 79;
	  INDEX iAvbWepTmg   = 81; INDEX iAvbWepMgn   = 83;
	  INDEX iAvbWepRkl   = 85; INDEX iAvbWepGrl   = 87;
	  INDEX iAvbWepFlm   = 89; INDEX iAvbWepSnp   = 91;
	  INDEX iAvbWepLsr   = 93; INDEX iAvbWepCnn   = 95;

		  // = Render Player health info ========================================================== 
    if (PlayerHealth < 100)  {iNumHl1 = 11;} //digits
    if (PlayerHealth < 10)   {iNumHl2 = 11;}
	  if (PlayerHealth < 1)    {iNumHl3 = 11;}
	  if (PlayerHealth > 999)  {iNumHl1 = iNumHl2 = iNumHl3 =  9;}
		    
	  if (PlayerHealth <= 0)   {iIcoHlt = 13;} //icon health
	  if (PlayerHealth >  0)   {iIcoHlt = 14;}
	  if (PlayerHealth >= 25)  {iIcoHlt = 15;}

	  CModelObject &icohlt  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_000_ICO_HEALTH    )->amo_moModelObject;
	  icohlt.mo_toTexture.PlayAnim(iIcoHlt, AOF_LOOPING|AOF_NORESTART);
	  icohlt.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
	  /*if (PlayerHealth <= 25)  {icohlt.mo_colBlendColor  = 0xFF000000|255;} else {icohlt.mo_colBlendColor  = h3d_iColor|255;}*/
	
    CModelObject &dgthlt1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_001_DGT_HEALTH_100)->amo_moModelObject; dgthlt1.mo_toTexture.PlayAnim(iNumHl1+101, 0); dgthlt1.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
    CModelObject &dgthlt2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_002_DGT_HEALTH_010)->amo_moModelObject; dgthlt2.mo_toTexture.PlayAnim(iNumHl2+101, 0); dgthlt2.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
    CModelObject &dgthlt3 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_003_DGT_HEALTH_001)->amo_moModelObject; dgthlt3.mo_toTexture.PlayAnim(iNumHl3+101, 0); dgthlt3.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
    CModelObject &brdhlth = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_106_BORDER_HEALTH )->amo_moModelObject; brdhlth.mo_toTexture.PlayAnim(99, 0);          brdhlth.mo_colBlendColor  = 0xFF000000|INDEX(iHealthBorderAlpha*fHudAppear);

		  // = Render Player armor info ===========================================================
    if (PlayerArmor > 999 ) {iNumAr1 = iNumAr2 = iNumAr3 = 9;}
    if (PlayerArmor < 0   ) {iNumAr1 = iNumAr2 = iNumAr3 = 12;}
    if (PlayerArmor < 100 ) {iNumAr1 = 11;}
    if (PlayerArmor < 10  ) {iNumAr2 = 11;}
    if (PlayerArmor < 1   ) {iNumAr3 = 11;}

    if (PlayerArmor <= 0  ) {iIcoArr = 16;}  //icon armor
	  if (PlayerArmor >  0  ) {iIcoArr = 17;}
	  if (PlayerArmor >  5  ) {iIcoArr = 18;}
	  if (PlayerArmor >  33 ) {iIcoArr = 19;}
	  if (PlayerArmor >  66 ) {iIcoArr = 20;}
	  if (PlayerArmor >  100) {iIcoArr = 21;}
	  if (PlayerArmor >  133) {iIcoArr = 22;}
	  if (PlayerArmor >  166) {iIcoArr = 23;}

	  CModelObject &icoarr  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_004_ICO_ARMOR    )->amo_moModelObject;
	  icoarr.mo_toTexture.PlayAnim(iIcoArr, AOF_LOOPING|AOF_NORESTART); icoarr.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;

    CModelObject &dgtarr1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_005_DGT_ARMOR_100)->amo_moModelObject; dgtarr1.mo_toTexture.PlayAnim(iNumAr1+101, 0); dgtarr1.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
    CModelObject &dgtarr2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_006_DGT_ARMOR_010)->amo_moModelObject; dgtarr2.mo_toTexture.PlayAnim(iNumAr2+101, 0); dgtarr2.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
    CModelObject &dgtarr3 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_007_DGT_ARMOR_001)->amo_moModelObject; dgtarr3.mo_toTexture.PlayAnim(iNumAr3+101, 0); dgtarr3.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
	  CModelObject &brdarmr = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_107_BORDER_ARMOR )->amo_moModelObject; brdarmr.mo_toTexture.PlayAnim(99, 0);          brdarmr.mo_colBlendColor  = 0xFF000000|INDEX(iBrdArmr*fHudAppear);

		// = Render Player shield info ==========================================================
	  CModelObject &dgtshield1   = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_009_DGT_SHIELD_100)->amo_moModelObject;
    CModelObject &dgtshield2   = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_010_DGT_SHIELD_010)->amo_moModelObject;
    CModelObject &dgtshield3   = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_011_DGT_SHIELD_001)->amo_moModelObject;
    CModelObject &brdshield    = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_108_BORDER_SHIELD )->amo_moModelObject;

    CModelObject &icoshield    = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_008_ICO_SHIELD    )->amo_moModelObject;

    if (m_fMaxShield>0) {
      if (GetFlags()&ENF_ALIVE) {
        if (PlayerShield < 100)  {iNumShield1 = 11;} //digits
        if (PlayerShield < 10)   {iNumShield2 = 11;}
	      //if (PlayerShield < 1)    {iNumShield3 = 11;}
	      if (PlayerShield > 999)  {iNumShield1 = iNumShield2 = iNumShield3 = 9;}
	      if (PlayerShield < 0)    {iNumShield1 = iNumShield2 = iNumShield3 = 11;}
		        
	      if (PlayerShield <  0)   {iIcoShield = 126;} //icon shield
	      if (PlayerShield >= 0)   {iIcoShield = 127;}
	      if (PlayerShield >= 1)   {iIcoShield = 128;}
      } else {
        if (PlayerShield <  100) {iNumShield1 = 11;} //digits
        if (PlayerShield <  10)  {iNumShield2 = 11;}
	      if (PlayerShield <  1)   {iNumShield3 = 11;}
        if (PlayerShield <  1)   {iIcoShield = 126;}

        if (PlayerShield <= 0)   {iIcoShield = 126;} //icon shield
	      if (PlayerShield >= 1)   {iIcoShield = 128;}
      }

    
	  CModelObject &icoshield    = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_008_ICO_SHIELD    )->amo_moModelObject;
	  icoshield.mo_toTexture.PlayAnim(iIcoShield, AOF_LOOPING|AOF_NORESTART);
	  icoshield.mo_colBlendColor = h3d_iColor|iCurrentAlpha;
	
    CModelObject &dgtshield1   = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_009_DGT_SHIELD_100)->amo_moModelObject; dgtshield1.mo_toTexture.PlayAnim(iNumShield1+101, 0); dgtshield1.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
    CModelObject &dgtshield2   = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_010_DGT_SHIELD_010)->amo_moModelObject; dgtshield2.mo_toTexture.PlayAnim(iNumShield2+101, 0); dgtshield2.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
    CModelObject &dgtshield3   = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_011_DGT_SHIELD_001)->amo_moModelObject; dgtshield3.mo_toTexture.PlayAnim(iNumShield3+101, 0); dgtshield3.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
    CModelObject &brdshield    = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_108_BORDER_SHIELD )->amo_moModelObject;  brdshield.mo_toTexture.PlayAnim(99, 0);               brdshield.mo_colBlendColor  = 0xFF000000|INDEX(iShieldBorderAlpha*fHudAppear);
	  }

		// = Render Player score/frags info =====================================================
    if (GetSP()->sp_bSinglePlayer || GetSP()->sp_bCooperative) {
    if (PlayerScore > 99999900) {iNumSc1 = iNumSc2 = iNumSc3 = iNumSc4 = iNumSc5 = iNumSc6 = 10;}
    if (PlayerScore<999999) {
      if (PlayerScore < 100000)   {iNumSc1 = 11;}
      if (PlayerScore < 10000)    {iNumSc2 = 11;}
      if (PlayerScore < 1000)     {iNumSc3 = 11;}
      if (PlayerScore < 100)      {iNumSc4 = 11;}
      if (PlayerScore < 10)       {iNumSc5 = 11;}
      if (PlayerScore < 0)        {iNumSc6 = 11;}
    } else {
      if (PlayerScore < 10000000) {iNumSc1 = 11;}
      //if (PlayerScore < 1000000)  {iNumSc2 = 11;}
      //if (PlayerScore < 100000)   {iNumSc3 = 11;}
      //if (PlayerScore < 10000)    {iNumSc4 = 11;}
      //if (PlayerScore < 1000)     {iNumSc5 = 11;}
      //if (PlayerScore < 0)        {iNumSc6 = 11;}
    }

    if (iMoney > 999999) {iNumMoney1 = iNumMoney2 = iNumMoney3 = iNumMoney4 = iNumMoney5 = iNumMoney6 = 10;}
    if (iMoney < 100000) {iNumMoney1 = 11;}
    if (iMoney < 10000)  {iNumMoney2 = 11;}
    if (iMoney < 1000)   {iNumMoney3 = 11;}
    if (iMoney < 100)    {iNumMoney4 = 11;}
    if (iMoney < 10)     {iNumMoney5 = 11;}
    if (iMoney < 0)      {iNumMoney6 = 11;}
    }
      
    if (GetSP()->sp_gmGameMode == CSessionProperties::GM_FRAGMATCH) {
    if (iAbsPlayerFrags > 999999) {iNumFr1 = iNumFr2 = iNumFr3 = iNumFr4 = iNumFr5 = iNumFr6 = 10;}
    if (iAbsPlayerFrags < 100000) {iNumFr1 = 11;}
    if (iAbsPlayerFrags < 10000)  {iNumFr2 = 11;}
    if (iAbsPlayerFrags < 1000)   {iNumFr3 = 11;}
    if (iAbsPlayerFrags < 100)    {iNumFr4 = 11;}
    if (iAbsPlayerFrags < 10)     {iNumFr5 = 11;}
    if (iAbsPlayerFrags < 0)      {iNumFr6 = 11;}

      if (PlayerFrags < 0) {
        BOOL placed = FALSE;
        for (INDEX i = 1; i <= 5; i++) {
          switch (i) {
          case 1: if (iNumFr5 == 11) { iNumFr5 = 10; placed = TRUE; } break;
          case 2: if (iNumFr4 == 11) { iNumFr4 = 10; placed = TRUE; } break;
          case 3: if (iNumFr3 == 11) { iNumFr3 = 10; placed = TRUE; } break;
          case 4: if (iNumFr2 == 11) { iNumFr2 = 10; placed = TRUE; } break;
          case 5: // if last digit is zero or lower than maximum
            if (iNumFr1 == 11 || PlayerFrags < -99999) { 
              iNumFr1 = 10;
              //set -99999 if number was huge
              if (PlayerFrags < -99999) {iNumFr2 = iNumFr3 = iNumFr4 = iNumFr5 = iNumFr6 = 10;}
              }
              break;
            }
            if (placed) { break; }
          }
        }
      } 
      if (GetSP()->sp_gmGameMode == CSessionProperties::GM_SCOREMATCH) {
      if (iAbsPlayerScore > 999999)   {iNumDmSc1 = iNumDmSc2 = iNumDmSc3 = iNumDmSc4 = iNumDmSc5 = iNumDmSc6 = 10;}
      if (iAbsPlayerScore < 100000)   {iNumDmSc1 = 11;}
      if (iAbsPlayerScore < 10000)    {iNumDmSc2 = 11;}
      if (iAbsPlayerScore < 1000)     {iNumDmSc3 = 11;}
      if (iAbsPlayerScore < 100)      {iNumDmSc4 = 11;}
      if (iAbsPlayerScore < 10)       {iNumDmSc5 = 11;}
      if (iAbsPlayerScore < 0)        {iNumDmSc6 = 11;}

      if (PlayerScore < 0) {
        BOOL placed = FALSE;
        for (INDEX i = 1; i <= 5; i++) {
          switch (i) {
          case 1: if (iNumDmSc5 == 11) { iNumDmSc5 = 10; placed = TRUE; } break;
          case 2: if (iNumDmSc4 == 11) { iNumDmSc4 = 10; placed = TRUE; } break;
          case 3: if (iNumDmSc3 == 11) { iNumDmSc3 = 10; placed = TRUE; } break;
          case 4: if (iNumDmSc2 == 11) { iNumDmSc2 = 10; placed = TRUE; } break;
          case 5: // if last digit is zero or lower than maximum
            if (iNumDmSc1 == 11 || PlayerScore < -99999) { 
              iNumDmSc1 = 11;
              //set -99999 if number was huge
              if (PlayerScore < -99999) {iNumDmSc2 = iNumDmSc3 = iNumDmSc4 = iNumDmSc5 = iNumDmSc6 = 10;}
            }
            break;
          }
          if (placed) { break; }
        }
      }
      }

      // render standard score if playing single/coop
      if (GetSP()->sp_bSinglePlayer || GetSP()->sp_bCooperative) {
        CModelObject &icoscr  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_012_ICO_SCORE       )->amo_moModelObject;  icoscr.mo_toTexture.PlayAnim(iIcoFrg, 0); icoscr.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;

        CModelObject &dgtscr1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_013_DGT_SCORE_100000)->amo_moModelObject; dgtscr1.mo_toTexture.PlayAnim(iNumSc1+101, 0); dgtscr1.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_014_DGT_SCORE_010000)->amo_moModelObject; dgtscr2.mo_toTexture.PlayAnim(iNumSc2+101, 0); dgtscr2.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr3 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_015_DGT_SCORE_001000)->amo_moModelObject; dgtscr3.mo_toTexture.PlayAnim(iNumSc3+101, 0); dgtscr3.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr4 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_016_DGT_SCORE_000100)->amo_moModelObject; dgtscr4.mo_toTexture.PlayAnim(iNumSc4+101, 0); dgtscr4.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr5 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_017_DGT_SCORE_000010)->amo_moModelObject; dgtscr5.mo_toTexture.PlayAnim(iNumSc5+101, 0); dgtscr5.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr6 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_018_DGT_SCORE_000001)->amo_moModelObject; dgtscr6.mo_toTexture.PlayAnim(iNumSc6+101, 0); dgtscr6.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dotscr  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_019_DOT_SCORE       )->amo_moModelObject;  dotscr.mo_toTexture.PlayAnim(iDotScr    , 0);  dotscr.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
      }
      if (GetSP()->sp_gmGameMode == CSessionProperties::GM_FRAGMATCH) {
        CModelObject &icoscr  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_012_ICO_SCORE       )->amo_moModelObject; icoscr.mo_toTexture.PlayAnim(iIcoFrg, 0); icoscr.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;

        CModelObject &dgtscr1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_013_DGT_SCORE_100000)->amo_moModelObject; dgtscr1.mo_toTexture.PlayAnim(iNumFr1+101, 0); dgtscr1.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_014_DGT_SCORE_010000)->amo_moModelObject; dgtscr2.mo_toTexture.PlayAnim(iNumFr2+101, 0); dgtscr2.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr3 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_015_DGT_SCORE_001000)->amo_moModelObject; dgtscr3.mo_toTexture.PlayAnim(iNumFr3+101, 0); dgtscr3.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr4 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_016_DGT_SCORE_000100)->amo_moModelObject; dgtscr4.mo_toTexture.PlayAnim(iNumFr4+101, 0); dgtscr4.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr5 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_017_DGT_SCORE_000010)->amo_moModelObject; dgtscr5.mo_toTexture.PlayAnim(iNumFr5+101, 0); dgtscr5.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr6 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_018_DGT_SCORE_000001)->amo_moModelObject; dgtscr6.mo_toTexture.PlayAnim(iNumFr6+101, 0); dgtscr6.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
      }
      if (GetSP()->sp_gmGameMode == CSessionProperties::GM_SCOREMATCH) {
        CModelObject &icoscr  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_012_ICO_SCORE       )->amo_moModelObject;  icoscr.mo_toTexture.PlayAnim(iIcoScr, 0); icoscr.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;

        CModelObject &dgtscr1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_013_DGT_SCORE_100000)->amo_moModelObject; dgtscr1.mo_toTexture.PlayAnim(iNumDmSc1+101, 0); dgtscr1.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_014_DGT_SCORE_010000)->amo_moModelObject; dgtscr2.mo_toTexture.PlayAnim(iNumDmSc2+101, 0); dgtscr2.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr3 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_015_DGT_SCORE_001000)->amo_moModelObject; dgtscr3.mo_toTexture.PlayAnim(iNumDmSc3+101, 0); dgtscr3.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr4 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_016_DGT_SCORE_000100)->amo_moModelObject; dgtscr4.mo_toTexture.PlayAnim(iNumDmSc4+101, 0); dgtscr4.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr5 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_017_DGT_SCORE_000010)->amo_moModelObject; dgtscr5.mo_toTexture.PlayAnim(iNumDmSc5+101, 0); dgtscr5.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
        CModelObject &dgtscr6 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_018_DGT_SCORE_000001)->amo_moModelObject; dgtscr6.mo_toTexture.PlayAnim(iNumDmSc6+101, 0); dgtscr6.mo_colBlendColor  = C_WHITE|iCurrentAlpha;
      }

      // = Render Player death info ===============================================================
      if (PlayerDeaths > 999999)  {iNumDt1 = iNumDt2 = iNumDt3 = iNumDt4 = iNumDt5 = iNumDt6 = 9;}
      if (PlayerDeaths < 100000)  {iNumDt1 = 11;}
      if (PlayerDeaths < 10000)   {iNumDt2 = 11;}
      if (PlayerDeaths < 1000)    {iNumDt3 = 11;}
      if (PlayerDeaths < 100)     {iNumDt4 = 11;}
      if (PlayerDeaths < 10)      {iNumDt5 = 11;}
      if (PlayerDeaths < 0)       {iNumDt6 = 11;}

      if (PlayerMana > 999999)    {iNumMn1 = iNumMn2 = iNumMn3 = iNumMn4 = iNumMn5 = iNumMn6 = 9;}
      if (PlayerMana < 100000)    {iNumMn1 = 11;}
      if (PlayerMana < 10000)     {iNumMn2 = 11;}
      if (PlayerMana < 1000)      {iNumMn3 = 11;}
      if (PlayerMana < 100)       {iNumMn4 = 11;}
      if (PlayerMana < 10)        {iNumMn5 = 11;}
      if (PlayerMana < 0)         {iNumMn6 = 11;}
      
      if (GetSP()->sp_gmGameMode == CSessionProperties::GM_FRAGMATCH) {
        CModelObject &icoskl  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_020_ICO_SKULL       )->amo_moModelObject;  icoskl.mo_toTexture.PlayAnim(iIcoDth, 0); icoskl.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;

        CModelObject &dgtdth1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_021_DGT_DEATH_100000)->amo_moModelObject; dgtdth1.mo_toTexture.PlayAnim(iNumDt1+101, 0); dgtdth1.mo_colBlendColor  = H3DC_WHITE|iCurrentAlpha;
        CModelObject &dgtdth2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_022_DGT_DEATH_010000)->amo_moModelObject; dgtdth2.mo_toTexture.PlayAnim(iNumDt2+101, 0); dgtdth2.mo_colBlendColor  = H3DC_WHITE|iCurrentAlpha;
        CModelObject &dgtdth3 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_023_DGT_DEATH_001000)->amo_moModelObject; dgtdth3.mo_toTexture.PlayAnim(iNumDt3+101, 0); dgtdth3.mo_colBlendColor  = H3DC_WHITE|iCurrentAlpha;
        CModelObject &dgtdth4 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_024_DGT_DEATH_000100)->amo_moModelObject; dgtdth4.mo_toTexture.PlayAnim(iNumDt4+101, 0); dgtdth4.mo_colBlendColor  = H3DC_WHITE|iCurrentAlpha;
        CModelObject &dgtdth5 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_025_DGT_DEATH_000010)->amo_moModelObject; dgtdth5.mo_toTexture.PlayAnim(iNumDt5+101, 0); dgtdth5.mo_colBlendColor  = H3DC_WHITE|iCurrentAlpha;
        CModelObject &dgtdth6 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_026_DGT_DEATH_000001)->amo_moModelObject; dgtdth6.mo_toTexture.PlayAnim(iNumDt6+101, 0); dgtdth6.mo_colBlendColor  = H3DC_WHITE|iCurrentAlpha;
      } else if (GetSP()->sp_gmGameMode == CSessionProperties::GM_SCOREMATCH) {
        CModelObject &icoskl  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_020_ICO_SKULL       )->amo_moModelObject;  icoskl.mo_toTexture.PlayAnim(iIcoDth, 0); icoskl.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;

        CModelObject &dgtdth1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_021_DGT_DEATH_100000)->amo_moModelObject; dgtdth1.mo_toTexture.PlayAnim(iNumMn1+101, 0); dgtdth1.mo_colBlendColor  = H3DC_WHITE|iCurrentAlpha;
        CModelObject &dgtdth2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_022_DGT_DEATH_010000)->amo_moModelObject; dgtdth2.mo_toTexture.PlayAnim(iNumMn2+101, 0); dgtdth2.mo_colBlendColor  = H3DC_WHITE|iCurrentAlpha;
        CModelObject &dgtdth3 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_023_DGT_DEATH_001000)->amo_moModelObject; dgtdth3.mo_toTexture.PlayAnim(iNumMn3+101, 0); dgtdth3.mo_colBlendColor  = H3DC_WHITE|iCurrentAlpha;
        CModelObject &dgtdth4 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_024_DGT_DEATH_000100)->amo_moModelObject; dgtdth4.mo_toTexture.PlayAnim(iNumMn4+101, 0); dgtdth4.mo_colBlendColor  = H3DC_WHITE|iCurrentAlpha;
        CModelObject &dgtdth5 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_025_DGT_DEATH_000010)->amo_moModelObject; dgtdth5.mo_toTexture.PlayAnim(iNumMn5+101, 0); dgtdth5.mo_colBlendColor  = H3DC_WHITE|iCurrentAlpha;
        CModelObject &dgtdth6 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_026_DGT_DEATH_000001)->amo_moModelObject; dgtdth6.mo_toTexture.PlayAnim(iNumMn6+101, 0); dgtdth6.mo_colBlendColor  = H3DC_WHITE|iCurrentAlpha;
      }

      // = Render money info ======================================================================
      
      if (GetSP()->sp_bSinglePlayer || GetSP()->sp_bCooperative) {
        CModelObject &icoskl    = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_020_ICO_SKULL       )->amo_moModelObject;  icoskl.mo_toTexture.PlayAnim(iIcoScr, 0); icoskl.mo_colBlendColor  = m_iMoney > 0 ? h3d_iColor|iCurrentAlpha : h3d_iColor|0; //I don't know what is it, but it works

        CModelObject &dgtmoney1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_021_DGT_DEATH_100000)->amo_moModelObject; dgtmoney1.mo_toTexture.PlayAnim(iNumMoney1+101, 0); dgtmoney1.mo_colBlendColor  = m_iMoney > 0 ? H3DC_WHITE|iCurrentAlpha : H3DC_WHITE|0;
        CModelObject &dgtmoney2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_022_DGT_DEATH_010000)->amo_moModelObject; dgtmoney2.mo_toTexture.PlayAnim(iNumMoney2+101, 0); dgtmoney2.mo_colBlendColor  = m_iMoney > 0 ? H3DC_WHITE|iCurrentAlpha : H3DC_WHITE|0;
        CModelObject &dgtmoney3 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_023_DGT_DEATH_001000)->amo_moModelObject; dgtmoney3.mo_toTexture.PlayAnim(iNumMoney3+101, 0); dgtmoney3.mo_colBlendColor  = m_iMoney > 0 ? H3DC_WHITE|iCurrentAlpha : H3DC_WHITE|0;
        CModelObject &dgtmoney4 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_024_DGT_DEATH_000100)->amo_moModelObject; dgtmoney4.mo_toTexture.PlayAnim(iNumMoney4+101, 0); dgtmoney4.mo_colBlendColor  = m_iMoney > 0 ? H3DC_WHITE|iCurrentAlpha : H3DC_WHITE|0;
        CModelObject &dgtmoney5 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_025_DGT_DEATH_000010)->amo_moModelObject; dgtmoney5.mo_toTexture.PlayAnim(iNumMoney5+101, 0); dgtmoney5.mo_colBlendColor  = m_iMoney > 0 ? H3DC_WHITE|iCurrentAlpha : H3DC_WHITE|0;
        CModelObject &dgtmoney6 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_026_DGT_DEATH_000001)->amo_moModelObject; dgtmoney6.mo_toTexture.PlayAnim(iNumMoney6+101, 0); dgtmoney6.mo_colBlendColor  = m_iMoney > 0 ? H3DC_WHITE|iCurrentAlpha : H3DC_WHITE|0;
      }

      // = Render credits info ====================================================================

      CModelObject &icoextra  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_027_ICO_EXTRALIFE )->amo_moModelObject;
      CModelObject &dgtextra1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_028_DGT_EXTRALIFE_10)->amo_moModelObject;
      CModelObject &dgtextra2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_029_DGT_EXTRALIFE_01)->amo_moModelObject;
      
    if (!GetSP()->sp_bSinglePlayer && GetSP()->sp_bCooperative && GetSP()->sp_ctCredits!=-1) {
		
		  if (iNumExtra < 10  ) {iNumExtra1 = 11;}

		  //if (iNumExtra <= 0  ) {iIcoExtra = 29;}

		  CModelObject &icoextra  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_027_ICO_EXTRALIFE )->amo_moModelObject;    icoextra.mo_toTexture.PlayAnim(iIcoExtra, AOF_LOOPING|AOF_NORESTART); icoextra.mo_colBlendColor  = 0xFF520000|iCurrentAlpha;
		  CModelObject &dgtextra1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_028_DGT_EXTRALIFE_10)->amo_moModelObject; dgtextra1.mo_toTexture.PlayAnim(iNumExtra1+101, 0); dgtextra1.mo_colBlendColor  = 0xFF520000|iCurrentAlpha;
		  CModelObject &dgtextra2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_029_DGT_EXTRALIFE_01)->amo_moModelObject; dgtextra2.mo_toTexture.PlayAnim(iNumExtra2+101, 0); dgtextra2.mo_colBlendColor  = 0xFF520000|iCurrentAlpha;
	  }

      // = Render PowerUp Serious Damage info =====================================================
	  if (PlayerPwUpSD <= 0) {iIcoPUSD  = 26;}
	  if (PlayerPwUpSD >  0) {iIcoPUSD  = 27;}
	  if (PlayerPwUpSD >  7) {iIcoPUSD  = 28;}

	  if (fTimerSeriousDamage <= 0   ) {iBarSeriousDamage = 62;}
	  if (fTimerSeriousDamage >  0.1 ) {iBarSeriousDamage = 63;}
	  if (fTimerSeriousDamage >  0.28) {iBarSeriousDamage = 64;}
	  if (fTimerSeriousDamage >  0.53) {iBarSeriousDamage = 65;}
	  if (fTimerSeriousDamage >  0.79) {iBarSeriousDamage = 66;}

      CModelObject &icopusd = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_030_ICO_SERIOUSDAMAGE)->amo_moModelObject;  icopusd.mo_toTexture.PlayAnim(iIcoPUSD, AOF_LOOPING|AOF_NORESTART); icopusd.mo_colBlendColor  = 0xFF520000|iCurrentAlpha;
      CModelObject &barpusd = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_031_BAR_SERIOUSDAMAGE)->amo_moModelObject;  barpusd.mo_toTexture.PlayAnim(iBarSeriousDamage, 0); barpusd.mo_colBlendColor  = 0xFF520000|iCurrentAlpha;
      
		  // = Render PowerUp Invulnerability info ================================================
	  if (PlayerPwUpIU <= 0) {iIcoPUIU  = 29;}
	  if (PlayerPwUpIU >  0) {iIcoPUIU  = 30;}
	  if (PlayerPwUpIU >  5) {iIcoPUIU  = 31;}

	  if (fTimerInvulnerability <= 0   ) {iBarInvulnerability = 62;}
	  if (fTimerInvulnerability >  0.1 ) {iBarInvulnerability = 63;}
	  if (fTimerInvulnerability >  0.28) {iBarInvulnerability = 64;}
	  if (fTimerInvulnerability >  0.53) {iBarInvulnerability = 65;}
	  if (fTimerInvulnerability >  0.79) {iBarInvulnerability = 66;}

      CModelObject &icopuiu = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_032_ICO_INVULNERABILITY)->amo_moModelObject; icopuiu.mo_toTexture.PlayAnim(iIcoPUIU, AOF_LOOPING|AOF_NORESTART); icopuiu.mo_colBlendColor  = 0x40D0FF00|iCurrentAlpha;
      CModelObject &barpuiu = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_033_BAR_INVULNERABILITY)->amo_moModelObject; barpuiu.mo_toTexture.PlayAnim(iBarInvulnerability, 0); barpuiu.mo_colBlendColor  = 0x40D0FF00|iCurrentAlpha;

		  // = Render Serious Speed info ==========================================================
	  if (PlayerPwUpSS <= 0) {iIcoPUSS  = 32;}
	  if (PlayerPwUpSS >  0) {iIcoPUSS  = 33;}
	  if (PlayerPwUpSS >  3) {iIcoPUSS  = 34;}
	  
	  if (fTimerSeriousSpeed <= 0   ) {iBarSeriousSpeed = 62;}
	  if (fTimerSeriousSpeed >  0.1 ) {iBarSeriousSpeed = 63;}
	  if (fTimerSeriousSpeed >  0.28) {iBarSeriousSpeed = 64;}
	  if (fTimerSeriousSpeed >  0.53) {iBarSeriousSpeed = 65;}
	  if (fTimerSeriousSpeed >  0.79) {iBarSeriousSpeed = 66;}

      CModelObject &icopuss = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_034_ICO_SERIOUSSPEED)->amo_moModelObject; icopuss.mo_toTexture.PlayAnim(iIcoPUSS, AOF_LOOPING|AOF_NORESTART); icopuss.mo_colBlendColor  = 0xFFB20000|iCurrentAlpha;
      CModelObject &barpuss = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_035_BAR_SERIOUSSPEED)->amo_moModelObject; barpuss.mo_toTexture.PlayAnim(iBarSeriousSpeed, 0); barpuss.mo_colBlendColor  = 0xFFB20000|iCurrentAlpha;

		  // = Render Invisible info ==============================================================
	  if (PlayerPwUpIS <= 0) {iIcoPUIS  = 35;}
	  if (PlayerPwUpIS >  0) {iIcoPUIS  = 36;}
	  if (PlayerPwUpIS >  5) {iIcoPUIS  = 37;}

	  if (fTimerInvisibility <= 0   ) {iBarInvisibility = 62;}
	  if (fTimerInvisibility >  0.1 ) {iBarInvisibility = 63;}
	  if (fTimerInvisibility >  0.28) {iBarInvisibility = 64;}
	  if (fTimerInvisibility >  0.53) {iBarInvisibility = 65;}
	  if (fTimerInvisibility >  0.79) {iBarInvisibility = 66;}

    CModelObject &icopuis = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_036_ICO_INVISIBILITY)->amo_moModelObject; icopuis.mo_toTexture.PlayAnim(iIcoPUIS, AOF_LOOPING|AOF_NORESTART); icopuis.mo_colBlendColor  = 0xCCCCCC00|iCurrentAlpha;
    CModelObject &barpuis = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_037_BAR_INVISIBILITY)->amo_moModelObject; barpuis.mo_toTexture.PlayAnim(iBarInvisibility, 0); barpuis.mo_colBlendColor  = 0xCCCCCC00|iCurrentAlpha;
      
		  // = Render Current ammo info ===========================================================
	  if (iCurAmm < 100)     {iNumAm1 = 11;}
    if (iCurAmm < 10)      {iNumAm2 = 11;}
	  if (iCurAmm < 0)       {iNumAm3 = 11;}

	  CModelObject &idgtamm1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_038_DGT_CURRENTAMMO_100)->amo_moModelObject; idgtamm1.mo_toTexture.PlayAnim(iNumAm1+113, 0); idgtamm1.mo_colBlendColor  = h3d_iColor|iIAAlpha;
	  CModelObject &idgtamm2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_039_DGT_CURRENTAMMO_010)->amo_moModelObject; idgtamm2.mo_toTexture.PlayAnim(iNumAm2+113, 0); idgtamm2.mo_colBlendColor  = h3d_iColor|iIAAlpha;
	  CModelObject &idgtamm3 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_040_DGT_CURRENTAMMO_001)->amo_moModelObject; idgtamm3.mo_toTexture.PlayAnim(iNumAm3+113, 0); idgtamm3.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		 
	  FLOAT fMaxAmmoValue    = GetPlayerWeapons()->GetMaxAmmo();
	  FLOAT fAmmoValue       = 0;
	  FLOAT fNormAmmoValue   = 0;
      fAmmoValue = GetPlayerWeapons()->GetAmmo();
      fNormAmmoValue = (fAmmoValue / fMaxAmmoValue);
		  
      if (!GetSP()->sp_bInfiniteAmmo) {
	    if (fNormAmmoValue <= 0.1f) {iBrdAmmo = Abs(Sin(_pTimer->CurrentTick()*150))*255; }
	    if (fNormAmmoValue <= 0.0f) {iBrdAmmo = 0;}
      }
		  CModelObject &brdammo  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_109_BORDER_AMMO)->amo_moModelObject; brdammo.mo_toTexture.PlayAnim(99, /*AOF_LOOPING|AOF_NORESTART*/ 0);  brdammo.mo_colBlendColor  = 0xFF000000|INDEX(iBrdAmmo*fHudAppear);

		  // = Render unread message info =========================================================
      INDEX iLowTimer = 255;
      if (GetSP()->sp_bSinglePlayer || GetSP()->sp_bCooperative) {
        if (iMessages < 100) {iNumMsg1 = 12;}
		if (iMessages < 10 ) {iNumMsg2 = 12;}
        if (iMessages < 1  ) {iNumMsg3 = 12;}

		if (iMessages >  0 ) {iIcoMsg  = 39;} else {iIcoMsg = 38;}
      } else { // if playing scorematch or fragmatch
        iIcoMsg = 40;
        FLOAT fTimeLeft = ClampDn(GetSP()->sp_iTimeLimit*60.0f - _pNetwork->GetGameTime(), 0.0f);
        INDEX iSeconds = (INDEX)fTimeLeft;
        INDEX iMinutes = INDEX(fTimeLeft / 60.0f);
        INDEX iMilliseconds = INDEX((fTimeLeft-iSeconds) * 10.0f);
        if (iMinutes >= 5) {
          iNumMsg1     = ((iMinutes%1000)/100)+1;
		      iNumMsg2     = ((iMinutes%100)/10)+1;
		      iNumMsg3     = (iMinutes%10)+1;

        if (iMinutes < 100) {iNumMsg1 = 12;}
        if (iMinutes < 10 ) {iNumMsg2 = 12;}
        }

        if (fTimeLeft <= 300) {
          iNumMsg1     = ((iSeconds%1000)/100)+1;
		      iNumMsg2     = ((iSeconds%100)/10)+1;
		      iNumMsg3     = (iSeconds%10)+1;
          
          if (iSeconds < 100) {iNumMsg1 = 12;}
          if (iSeconds < 10 ) {iNumMsg2 = 12;}
        }

        if (fTimeLeft <= 30) {
          iNumMsg1     = ((iSeconds%100)/10)+1;
		      iNumMsg2     = (iSeconds%10)+1;
	        iNumMsg3     = (iMilliseconds)+1;
          
          if (iSeconds < 10) {iNumMsg1 = 12;}
          if (iSeconds < 1 ) {iNumMsg2 = 12;}
          
          if (fTimeLeft <= 0) {iLowTimer = 0;} else {
            iLowTimer = Abs(Sin(_pTimer->CurrentTick()*150))*255;
          }
        }
      }

		  CModelObject &icomsg  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_041_ICO_MESSAGE    )->amo_moModelObject;  icomsg.mo_toTexture.PlayAnim(iIcoMsg, AOF_LOOPING|AOF_NORESTART); icomsg.mo_colBlendColor  = h3d_iColor|INDEX(iLowTimer*fHudAppear);
		  CModelObject &dgtmsg1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_042_DGT_MESSAGE_100)->amo_moModelObject; dgtmsg1.mo_toTexture.PlayAnim(iNumMsg1, 0); dgtmsg1.mo_colBlendColor = h3d_iColor|INDEX(iLowTimer*fHudAppear);
		  CModelObject &dgtmsg2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_043_DGT_MESSAGE_010)->amo_moModelObject; dgtmsg2.mo_toTexture.PlayAnim(iNumMsg2, 0); dgtmsg2.mo_colBlendColor = h3d_iColor|INDEX(iLowTimer*fHudAppear);
		  CModelObject &dgtmsg3 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_044_DGT_MESSAGE_001)->amo_moModelObject; dgtmsg3.mo_toTexture.PlayAnim(iNumMsg3, 0); dgtmsg3.mo_colBlendColor = h3d_iColor|INDEX(iLowTimer*fHudAppear);

          // = Render boss/counter info ===========================================================
     
		  if (iCount   <  100)  {iNumCnt1 = 12;}
		  if (iCount   <  10 )  {iNumCnt2 = 12;}
		  if (iCount   <= 0  )  {iNumCnt3 = 12;}

          if (iCountType == 1)  {iIcoCnt  = 125;} else {iIcoCnt  = 13;}

		  CModelObject &icocnt  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_045_ICO_BOSSHEALTH    )->amo_moModelObject;  icocnt.mo_toTexture.PlayAnim(iIcoCnt,      0); icocnt.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
		  CModelObject &numcnt1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_046_DGT_BOSSHEALTH_100)->amo_moModelObject; numcnt1.mo_toTexture.PlayAnim(iNumCnt1+112, 0); numcnt1.mo_colBlendColor = h3d_iColor|iCurrentAlpha;
		  CModelObject &numcnt2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_047_DGT_BOSSHEALTH_010)->amo_moModelObject; numcnt2.mo_toTexture.PlayAnim(iNumCnt2+112, 0); numcnt2.mo_colBlendColor = h3d_iColor|iCurrentAlpha;
		  CModelObject &numcnt3 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_048_DGT_BOSSHEALTH_001)->amo_moModelObject; numcnt3.mo_toTexture.PlayAnim(iNumCnt3+112, 0); numcnt3.mo_colBlendColor = h3d_iColor|iCurrentAlpha;

		  // = Render oxygen info =================================================================
      if (!(GetFlags()&ENF_ALIVE)) {
        iOxygen = 31;
		  }
      
	    if (iOxygen < 10) {iNumOxy1 = 12;}
		  if (iOxygen <  0) {iNumOxy2 = 12;}
		  if (iOxygen >=30) {iNumOxy1 = iNumOxy2 = 12;}

		  if (iOxygen >= 0) {iIcoOxy  = 42;}
		  if (iOxygen >  9) {iIcoOxy  = 43;}
		  if (iOxygen >=30) {iIcoOxy  = 41;}

		  CModelObject &icooxy  = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_049_ICO_OXYGEN   )->amo_moModelObject;  icooxy.mo_toTexture.PlayAnim(iIcoOxy, AOF_LOOPING|AOF_NORESTART); icooxy.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
		  CModelObject &dgtoxy1 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_050_DGT_OXYGEN_10)->amo_moModelObject; dgtoxy1.mo_toTexture.PlayAnim(iNumOxy1+112, 0); dgtoxy1.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
		  CModelObject &dgtoxy2 = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_051_DGT_OXYGEN_01)->amo_moModelObject; dgtoxy2.mo_toTexture.PlayAnim(iNumOxy2+112, 0); dgtoxy2.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;

		  // = Render ammo info ===================================================================
		  if (iShls      <= 0   ) {iIcoShl  = 44;}
		  if (iShls      >  0   ) {iIcoShl  = 45;}

		  if (fGetAmmShl <= 0   ) {iBarShl  = 62;}
		  if (fGetAmmShl >  0.1 ) {iBarShl  = 63;}
		  if (fGetAmmShl >  0.28) {iBarShl  = 64;}
		  if (fGetAmmShl >  0.53) {iBarShl  = 65;}
		  if (fGetAmmShl >  0.79) {iBarShl  = 66;}

		  if (iCurAmmBrd == 1   ) {iBrdShl  = 68;} else {iBrdShl = 67;}
		  		  
		  CModelObject &icoshl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_052_ICO_SHELLS)->amo_moModelObject; icoshl.mo_toTexture.PlayAnim(iIcoShl, 0); icoshl.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &barshl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_053_BAR_SHELLS)->amo_moModelObject; barshl.mo_toTexture.PlayAnim(iBarShl, 0); barshl.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &brdshl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_054_BRD_SHELLS)->amo_moModelObject; brdshl.mo_toTexture.PlayAnim(iBrdShl, 0); brdshl.mo_colBlendColor  = H3DC_WHITE|iIAAlpha;

		  if (iBlts      <= 0   ) {iIcoBlt  = 46;}
		  if (iBlts      >  0   ) {iIcoBlt  = 47;}

		  if (fGetAmmBlt <= 0   ) {iBarBlt  = 62;}
		  if (fGetAmmBlt >  0.1 ) {iBarBlt  = 63;}
		  if (fGetAmmBlt >  0.28) {iBarBlt  = 64;}
		  if (fGetAmmBlt >  0.53) {iBarBlt  = 65;}
		  if (fGetAmmBlt >  0.79) {iBarBlt  = 66;}

		  if (iCurAmmBrd == 2   ) {iBrdBlt  = 68;} else {iBrdBlt = 67;}

		  CModelObject &icoblt = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_055_ICO_BULLETS)->amo_moModelObject; icoblt.mo_toTexture.PlayAnim(iIcoBlt, 0); icoblt.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &barblt = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_056_BAR_BULLETS)->amo_moModelObject; barblt.mo_toTexture.PlayAnim(iBarBlt, 0); barblt.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &brdblt = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_057_BRD_BULLETS)->amo_moModelObject; brdblt.mo_toTexture.PlayAnim(iBrdBlt, 0); brdblt.mo_colBlendColor  = H3DC_WHITE|iIAAlpha;

		  if (iRckt      <= 0   ) {iIcoRkt  = 48;}
		  if (iRckt      >  0   ) {iIcoRkt  = 49;}

		  if (fGetAmmRkt <= 0   ) {iBarRkt  = 62;}
		  if (fGetAmmRkt >  0.1 ) {iBarRkt  = 63;}
		  if (fGetAmmRkt >  0.28) {iBarRkt  = 64;}
		  if (fGetAmmRkt >  0.53) {iBarRkt  = 65;}
		  if (fGetAmmRkt >  0.79) {iBarRkt  = 66;}

		  if (iCurAmmBrd == 3   ) {iBrdRkt  = 68;} else {iBrdRkt = 67;}

		  CModelObject &icorkt = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_058_ICO_ROCKETS)->amo_moModelObject; icorkt.mo_toTexture.PlayAnim(iIcoRkt, 0); icorkt.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &barrkt = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_059_BAR_ROCKETS)->amo_moModelObject; barrkt.mo_toTexture.PlayAnim(iBarRkt, 0); barrkt.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &brdrkt = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_060_BRD_ROCKETS)->amo_moModelObject; brdrkt.mo_toTexture.PlayAnim(iBrdRkt, 0); brdrkt.mo_colBlendColor  = H3DC_WHITE|iIAAlpha;

		  if (iGrnd      <= 0   ) {iIcoGrd  = 50;}
		  if (iGrnd      >  0   ) {iIcoGrd  = 51;}

		  if (fGetAmmGrd <= 0   ) {iBarGrd  = 62;}
		  if (fGetAmmGrd >  0.1 ) {iBarGrd  = 63;}
		  if (fGetAmmGrd >  0.28) {iBarGrd  = 64;}
		  if (fGetAmmGrd >  0.53) {iBarGrd  = 65;}
		  if (fGetAmmGrd >  0.79) {iBarGrd  = 66;}

		  if (iCurAmmBrd == 4   ) {iBrdGrd  = 68;} else {iBrdGrd = 67;}

		  CModelObject &icogrd = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_061_ICO_GRENADES)->amo_moModelObject; icogrd.mo_toTexture.PlayAnim(iIcoGrd, 0); icogrd.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &bargrd = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_062_BAR_GRENADES)->amo_moModelObject; bargrd.mo_toTexture.PlayAnim(iBarGrd, 0); bargrd.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &brdgrd = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_063_BRD_GRENADES)->amo_moModelObject; brdgrd.mo_toTexture.PlayAnim(iBrdGrd, 0); brdgrd.mo_colBlendColor  = H3DC_WHITE|iIAAlpha;

		  if (iNplm      <= 0   ) {iIcoNpl  = 52;}
		  if (iNplm      >  0   ) {iIcoNpl  = 53;}

		  if (fGetAmmNpl <= 0   ) {iBarNpl  = 62;}
		  if (fGetAmmNpl >  0.1 ) {iBarNpl  = 63;}
		  if (fGetAmmNpl >  0.28) {iBarNpl  = 64;}
		  if (fGetAmmNpl >  0.53) {iBarNpl  = 65;}
		  if (fGetAmmNpl >  0.79) {iBarNpl  = 66;}

		  if (iCurAmmBrd == 5   ) {iBrdNpl  = 68;} else {iBrdNpl = 67;}

		  CModelObject &iconpl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_064_ICO_FUEL)->amo_moModelObject; iconpl.mo_toTexture.PlayAnim(iIcoNpl, 0); iconpl.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &barnpl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_065_BAR_FUEL)->amo_moModelObject; barnpl.mo_toTexture.PlayAnim(iBarNpl, 0); barnpl.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &brdnpl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_066_BRD_FUEL)->amo_moModelObject; brdnpl.mo_toTexture.PlayAnim(iBrdNpl, 0); brdnpl.mo_colBlendColor  = H3DC_WHITE|iIAAlpha;

		  if (iSnbl      <= 0   ) {iIcoSbl  = 54;}
		  if (iSnbl      >  0   ) {iIcoSbl  = 55;}

		  if (fGetAmmSbl <= 0   ) {iBarSbl  = 62;}
		  if (fGetAmmSbl >  0.1 ) {iBarSbl  = 63;}
		  if (fGetAmmSbl >  0.28) {iBarSbl  = 64;}
		  if (fGetAmmSbl >  0.53) {iBarSbl  = 65;}
		  if (fGetAmmSbl >  0.79) {iBarSbl  = 66;}

		  if (iCurAmmBrd == 6   ) {iBrdSbl  = 68;} else {iBrdSbl = 67;}
										  
		  CModelObject &icosbl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_067_ICO_SNIPERBULLETS)->amo_moModelObject; icosbl.mo_toTexture.PlayAnim(iIcoSbl, 0); icosbl.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &barsbl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_068_BAR_SNIPERBULLETS)->amo_moModelObject; barsbl.mo_toTexture.PlayAnim(iBarSbl, 0); barsbl.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &brdsbl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_069_BRD_SNIPERBULLETS)->amo_moModelObject; brdsbl.mo_toTexture.PlayAnim(iBrdSbl, 0); brdsbl.mo_colBlendColor  = H3DC_WHITE|iIAAlpha;

		  if (iElec      <= 0   ) {iIcoElc  = 56;}
		  if (iElec      >  0   ) {iIcoElc  = 57;}

		  if (fGetAmmElc <= 0   ) {iBarElc  = 62;}
		  if (fGetAmmElc >  0.1 ) {iBarElc  = 63;}
		  if (fGetAmmElc >  0.28) {iBarElc  = 64;}
		  if (fGetAmmElc >  0.53) {iBarElc  = 65;}
		  if (fGetAmmElc >  0.79) {iBarElc  = 66;}

		  if (iCurAmmBrd == 7   ) {iBrdElc  = 68;} else {iBrdElc = 67;}

		  CModelObject &icoelc = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_070_ICO_ELECTRICITY)->amo_moModelObject; icoelc.mo_toTexture.PlayAnim(iIcoElc, 0); icoelc.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &barelc = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_071_BAR_ELECTRICITY)->amo_moModelObject; barelc.mo_toTexture.PlayAnim(iBarElc, 0); barelc.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &brdelc = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_072_BRD_ELECTRICITY)->amo_moModelObject; brdelc.mo_toTexture.PlayAnim(iBrdElc, 0); brdelc.mo_colBlendColor  = H3DC_WHITE|iIAAlpha;

		  if (iIrbl      <= 0   ) {iIcoIrb  = 58;}
		  if (iIrbl      >  0   ) {iIcoIrb  = 59;}

		  if (fGetAmmIrb <= 0   ) {iBarIrb  = 62;}
		  if (fGetAmmIrb >  0.1 ) {iBarIrb  = 63;}
		  if (fGetAmmIrb >  0.28) {iBarIrb  = 64;}
		  if (fGetAmmIrb >  0.53) {iBarIrb  = 65;}
		  if (fGetAmmIrb >  0.79) {iBarIrb  = 66;}

		  if (iCurAmmBrd == 8   ) {iBrdIrb  = 68;} else {iBrdIrb = 67;}

		  CModelObject &icoirb = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_073_ICO_IRONBALL)->amo_moModelObject; icoirb.mo_toTexture.PlayAnim(iIcoIrb, 0); icoirb.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &barirb = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_074_BAR_IRONBALL)->amo_moModelObject; barirb.mo_toTexture.PlayAnim(iBarIrb, 0); barirb.mo_colBlendColor  = h3d_iColor|iIAAlpha;
		  CModelObject &brdirb = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_075_BRD_IRONBALL)->amo_moModelObject; brdirb.mo_toTexture.PlayAnim(iBrdIrb, 0); brdirb.mo_colBlendColor  = H3DC_WHITE|iIAAlpha;
		  
		  if (iSrbm == 0) {iIcoSrb = 60; iBarSrb = 62;}
		  if (iSrbm == 1) {iIcoSrb = 61; iBarSrb = 63;}
		  if (iSrbm == 2) {iIcoSrb = 61; iBarSrb = 64;}
		  if (iSrbm == 3) {iIcoSrb = 61; iBarSrb = 65;}
		  
		  CModelObject &icosrb = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_076_ICO_SERIOUSBOMB)->amo_moModelObject; icosrb.mo_toTexture.PlayAnim(iIcoSrb, 0); icosrb.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;
		  CModelObject &barsrb = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_077_BAR_SERIOUSBOMB)->amo_moModelObject; barsrb.mo_toTexture.PlayAnim(iBarSrb, 0); barsrb.mo_colBlendColor  = h3d_iColor|iCurrentAlpha;

		  // = Render weapon info =================================================================
		  INDEX iDisWep = 255;
		  CPlayerWeapons *_penWeapons = GetPlayerWeapons();
		  hud_tmWeaponsOnScreen = Clamp( hud_tmWeaponsOnScreen, 0.0f, 10.0f);
      INDEX DisWep = ((_tmNow - _penWeapons->m_tmWeaponChangeRequired) < hud_tmWeaponsOnScreen)?255:0;
          if (iAvbWep & (1<<(WEAPON_KNIFE-1)))           {iAvbWepKnf = 70;} else {iAvbWepKnf = 69;} if (iWntWep ==  1) {iWntWepKnf = 98;} else {iWntWepKnf = 97;}
		  if (iAvbWep & (1<<(WEAPON_CHAINSAW-1)))        {iAvbWepChs = 72;} else {iAvbWepChs = 71;} if (iWntWep ==  2) {iWntWepChs = 98;} else {iWntWepChs = 97;}
		  if (iAvbWep & (1<<(WEAPON_COLT-1)))            {iAvbWepClt = 74;} else {iAvbWepClt = 73;} if (iWntWep ==  3) {iWntWepClt = 98;} else {iWntWepClt = 97;}
		  if (iAvbWep & (1<<(WEAPON_DOUBLECOLT-1)))      {iAvbWepDcl = 74;} else {iAvbWepDcl = 73;} if (iWntWep ==  4) {iWntWepDcl = 98; iWntWepClt = 98; } else {iWntWepDcl = 97;}
		  if (iAvbWep & (1<<(WEAPON_SINGLESHOTGUN-1)))   {iAvbWepSht = 76;} else {iAvbWepSht = 75;} if (iWntWep ==  5) {iWntWepSht = 98;} else {iWntWepSht = 97;}
		  if (iAvbWep & (1<<(WEAPON_DOUBLESHOTGUN-1)))   {iAvbWepDsh = 78;} else {iAvbWepDsh = 77;} if (iWntWep ==  6) {iWntWepDsh = 98;} else {iWntWepDsh = 97;}
		  if (iAvbWep & (1<<(WEAPON_TOMMYGUN-1)))        {iAvbWepTmg = 80;} else {iAvbWepTmg = 79;} if (iWntWep ==  7) {iWntWepTmg = 98;} else {iWntWepTmg = 97;}
		  if (iAvbWep & (1<<(WEAPON_MINIGUN-1)))         {iAvbWepMgn = 82;} else {iAvbWepMgn = 81;} if (iWntWep ==  8) {iWntWepMgn = 98;} else {iWntWepMgn = 97;}
		  if (iAvbWep & (1<<(WEAPON_ROCKETLAUNCHER-1)))  {iAvbWepRkl = 84;} else {iAvbWepRkl = 83;} if (iWntWep ==  9) {iWntWepRkl = 98;} else {iWntWepRkl = 97;}
		  if (iAvbWep & (1<<(WEAPON_GRENADELAUNCHER-1))) {iAvbWepGrl = 86;} else {iAvbWepGrl = 85;} if (iWntWep == 10) {iWntWepGrl = 98;} else {iWntWepGrl = 97;}
		  if (iAvbWep & (1<<(WEAPON_FLAMER-1)))          {iAvbWepFlm = 88;} else {iAvbWepFlm = 87;} if (iWntWep == 11) {iWntWepFlm = 98;} else {iWntWepFlm = 97;}
		  if (iAvbWep & (1<<(WEAPON_SNIPER-1)))          {iAvbWepSnp = 90;} else {iAvbWepSnp = 89;} if (iWntWep == 12) {iWntWepSnp = 98;} else {iWntWepSnp = 97;}
		  if (iAvbWep & (1<<(WEAPON_LASER-1)))           {iAvbWepLsr = 92;} else {iAvbWepLsr = 91;} if (iWntWep == 13) {iWntWepLsr = 98;} else {iWntWepLsr = 97;}
		  if (iAvbWep & (1<<(WEAPON_IRONCANNON-1)))      {iAvbWepCnn = 94;} else {iAvbWepCnn = 93;} if (iWntWep == 14) {iWntWepCnn = 98;} else {iWntWepCnn = 97;}
		  CModelObject &icoknf = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_078_ICO_KNIFE          )->amo_moModelObject; icoknf.mo_toTexture.PlayAnim(iAvbWepKnf, 0); icoknf.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brdknf = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_079_BRD_KNIFE          )->amo_moModelObject; brdknf.mo_toTexture.PlayAnim(iWntWepKnf, 0); brdknf.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);        
		  CModelObject &icochs = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_080_ICO_CHAINSAW       )->amo_moModelObject; icochs.mo_toTexture.PlayAnim(iAvbWepChs, 0); icochs.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brdchs = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_081_BRD_CHAINSAW       )->amo_moModelObject; brdchs.mo_toTexture.PlayAnim(iWntWepChs, 0); brdchs.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);        
		  CModelObject &icoclt = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_082_ICO_COLT           )->amo_moModelObject; icoclt.mo_toTexture.PlayAnim(iAvbWepClt, 0); icoclt.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brdclt = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_083_BRD_COLT           )->amo_moModelObject; brdclt.mo_toTexture.PlayAnim(iWntWepClt, 0); brdclt.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);        
		  CModelObject &icodcl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_084_ICO_DOUBLECOLT     )->amo_moModelObject; icodcl.mo_toTexture.PlayAnim(iAvbWepDcl, 0); icodcl.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brddcl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_085_BRD_DOUBLECOLT     )->amo_moModelObject; brddcl.mo_toTexture.PlayAnim(iWntWepDcl, 0); brddcl.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);        
		  CModelObject &icosht = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_086_ICO_SHOTGUN        )->amo_moModelObject; icosht.mo_toTexture.PlayAnim(iAvbWepSht, 0); icosht.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brdsht = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_087_BRD_SHOTGUN        )->amo_moModelObject; brdsht.mo_toTexture.PlayAnim(iWntWepSht, 0); brdsht.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);        
		  CModelObject &icodsh = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_088_ICO_DOUBLESHOTGUN  )->amo_moModelObject; icodsh.mo_toTexture.PlayAnim(iAvbWepDsh, 0); icodsh.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brddsh = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_089_BRD_DOUBLESHOTGUN  )->amo_moModelObject; brddsh.mo_toTexture.PlayAnim(iWntWepDsh, 0); brddsh.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);        
		  CModelObject &icotmg = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_090_ICO_TOMMYGUN       )->amo_moModelObject; icotmg.mo_toTexture.PlayAnim(iAvbWepTmg, 0); icotmg.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brdtmg = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_091_BRD_TOMMYGUN       )->amo_moModelObject; brdtmg.mo_toTexture.PlayAnim(iWntWepTmg, 0); brdtmg.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);        
		  CModelObject &icomgn = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_092_ICO_MINIGUN        )->amo_moModelObject; icomgn.mo_toTexture.PlayAnim(iAvbWepMgn, 0); icomgn.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brdmgn = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_093_BRD_MINIGUN        )->amo_moModelObject; brdmgn.mo_toTexture.PlayAnim(iWntWepMgn, 0); brdmgn.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);
		  CModelObject &icorkl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_094_ICO_ROCKETLAUNCHER )->amo_moModelObject; icorkl.mo_toTexture.PlayAnim(iAvbWepRkl, 0); icorkl.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brdrkl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_095_BRD_ROCKETLAUNCHER )->amo_moModelObject; brdrkl.mo_toTexture.PlayAnim(iWntWepRkl, 0); brdrkl.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);
		  CModelObject &icogrl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_096_ICO_GRENADELAUNCHER)->amo_moModelObject; icogrl.mo_toTexture.PlayAnim(iAvbWepGrl, 0); icogrl.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brdgrl = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_097_BRD_GRENADELAUNCHER)->amo_moModelObject; brdgrl.mo_toTexture.PlayAnim(iWntWepGrl, 0); brdgrl.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);
		  CModelObject &icoflm = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_098_ICO_FLAMETHROWER   )->amo_moModelObject; icoflm.mo_toTexture.PlayAnim(iAvbWepFlm, 0); icoflm.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brdflm = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_099_BRD_FLAMETHROWER   )->amo_moModelObject; brdflm.mo_toTexture.PlayAnim(iWntWepFlm, 0); brdflm.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);
		  CModelObject &icosnp = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_100_ICO_SNIPERRIFLE    )->amo_moModelObject; icosnp.mo_toTexture.PlayAnim(iAvbWepSnp, 0); icosnp.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brdsnp = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_101_BRD_SNIPERRIFLE    )->amo_moModelObject; brdsnp.mo_toTexture.PlayAnim(iWntWepSnp, 0); brdsnp.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);
		  CModelObject &icolsr = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_102_ICO_LASER          )->amo_moModelObject; icolsr.mo_toTexture.PlayAnim(iAvbWepLsr, 0); icolsr.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brdlsr = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_103_BRD_LASER          )->amo_moModelObject; brdlsr.mo_toTexture.PlayAnim(iWntWepLsr, 0); brdlsr.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);
		  CModelObject &icocnn = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_104_ICO_CANNON         )->amo_moModelObject; icocnn.mo_toTexture.PlayAnim(iAvbWepCnn, 0); icocnn.mo_colBlendColor  = h3d_iColor|INDEX(DisWep*fHudAppear);
		  CModelObject &brdcnn = m_moH3D.GetAttachmentModel(H3D_BASE_ATTACHMENT_105_BRD_CANNON         )->amo_moModelObject; brdcnn.mo_toTexture.PlayAnim(iWntWepCnn, 0); brdcnn.mo_colBlendColor  = H3DC_WHITE|INDEX(DisWep*fHudAppear);
		  if (iShls <= 0) {icosht.mo_colBlendColor = H3DC_DIS|INDEX(DisWep*fHudAppear); icodsh.mo_colBlendColor = H3DC_DIS|INDEX(DisWep*fHudAppear);}
		  if (iShls >  0) {icosht.mo_colBlendColor = h3d_iColor|INDEX(DisWep*fHudAppear); icodsh.mo_colBlendColor = h3d_iColor|INDEX(DisWep*fHudAppear);}
		  if (iBlts <= 0) {icotmg.mo_colBlendColor = H3DC_DIS|INDEX(DisWep*fHudAppear); icomgn.mo_colBlendColor = H3DC_DIS|INDEX(DisWep*fHudAppear);}
		  if (iBlts >  0) {icotmg.mo_colBlendColor = h3d_iColor|INDEX(DisWep*fHudAppear); icomgn.mo_colBlendColor = h3d_iColor|INDEX(DisWep*fHudAppear);}
		  if (iRckt <= 0) {icorkl.mo_colBlendColor = H3DC_DIS|INDEX(DisWep*fHudAppear);}
		  if (iRckt >  0) {icorkl.mo_colBlendColor = h3d_iColor|INDEX(DisWep*fHudAppear);}
		  if (iGrnd <= 0) {icogrl.mo_colBlendColor = H3DC_DIS|INDEX(DisWep*fHudAppear);}
		  if (iGrnd >  0) {icogrl.mo_colBlendColor = h3d_iColor|INDEX(DisWep*fHudAppear);}
		  if (iNplm <= 0) {icoflm.mo_colBlendColor = H3DC_DIS|INDEX(DisWep*fHudAppear);}
		  if (iNplm >  0) {icoflm.mo_colBlendColor = h3d_iColor|INDEX(DisWep*fHudAppear);}
		  if (iSnbl <= 0) {icosnp.mo_colBlendColor = H3DC_DIS|INDEX(DisWep*fHudAppear);}
		  if (iSnbl >  0) {icosnp.mo_colBlendColor = h3d_iColor|INDEX(DisWep*fHudAppear);}
		  if (iElec <= 0) {icolsr.mo_colBlendColor = H3DC_DIS|INDEX(DisWep*fHudAppear);}
		  if (iElec >  0) {icolsr.mo_colBlendColor = h3d_iColor|INDEX(DisWep*fHudAppear);}
		  if (iIrbl <= 0) {icocnn.mo_colBlendColor = H3DC_DIS|INDEX(DisWep*fHudAppear);}
		  if (iIrbl >  0) {icocnn.mo_colBlendColor = h3d_iColor|INDEX(DisWep*fHudAppear);}

      if (m_penShop != NULL) {
        UpdateGUIShop();
      }
      
      SurfaceTranslucencyType eSST = STT_TRANSLUCENT;
      if (h3d_bRenderSurfaceAdd) {eSST = STT_ADD;} else {eSST = STT_TRANSLUCENT;}
        icohlt.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);								//CHANGE HUD 3D TO STT_ADD
        dgthlt1.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgthlt2.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgthlt3.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icoarr.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtarr1.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtarr2.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtarr3.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icoshield.SetSurfaceRenderFlags ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtshield1.SetSurfaceRenderFlags( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtshield2.SetSurfaceRenderFlags( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtshield3.SetSurfaceRenderFlags( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icoextra.SetSurfaceRenderFlags  ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtextra1.SetSurfaceRenderFlags ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtextra2.SetSurfaceRenderFlags ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icopusd.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        barpusd.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icopuiu.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        barpuiu.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icopuss.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        barpuss.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icopuis.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        barpuis.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        idgtamm1.SetSurfaceRenderFlags  ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        idgtamm2.SetSurfaceRenderFlags  ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        idgtamm3.SetSurfaceRenderFlags  ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icomsg.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtmsg1.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtmsg2.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtmsg3.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icocnt.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        numcnt1.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        numcnt2.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        numcnt3.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icooxy.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtoxy1.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        dgtoxy2.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icoshl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        barshl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdshl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icoblt.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        barblt.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdblt.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icorkt.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        barrkt.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdrkt.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icogrd.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        bargrd.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdgrd.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        iconpl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        barnpl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdnpl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icosbl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        barsbl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdsbl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icoelc.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        barelc.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdelc.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icoirb.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        barirb.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdirb.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icosrb.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        barsrb.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icoknf.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdknf.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icochs.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdchs.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icoclt.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdclt.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icodcl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brddcl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icosht.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdsht.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icodsh.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brddsh.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icotmg.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdtmg.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icomgn.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdmgn.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icorkl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdrkl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icogrl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdgrl.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icoflm.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdflm.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icosnp.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdsnp.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icolsr.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdlsr.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        icocnn.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdcnn.SetSurfaceRenderFlags    ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdhlth.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdarmr.SetSurfaceRenderFlags   ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);
        brdshield.SetSurfaceRenderFlags ( 0, 0, SST_FULLBRIGHT, eSST, SRF_DIFFUSE);

  }

    void GetHPType(INDEX& iCountType, INDEX& iCount) {

  		if( m_penMainMusicHolder!=NULL) {
			  CMusicHolder &mh = (CMusicHolder&)*m_penMainMusicHolder;

		    if( mh.m_penBoss!=NULL && (mh.m_penBoss->en_ulFlags&ENF_ALIVE)) {
			    CEnemyBase &eb = (CEnemyBase&)*mh.m_penBoss;
			    ASSERT( eb.m_fMaxHealth>0);
			    iCount     = ceil(eb.GetHealth()/eb.m_fMaxHealth*100.0f);
			    iCountType = 1;
          return;
		    }

		    if( mh.m_penCounter!=NULL) {
			    CEnemyCounter &ec = (CEnemyCounter&)*mh.m_penCounter;
			    if (ec.m_iCount>0) {
            FLOAT fCount = ec.m_iCount;
            FLOAT fCountFrom = ec.m_iCountFrom;
            FLOAT f = (fCount/fCountFrom)*100.0f;
			      iCount     = ceil(f);
			      iCountType = 0;  // disable enemies health Icon 
            return;
			    }
		    }
      }

      if (h3d_fEnemyShowMaxHealth != -1.0f && GetPlayerWeapons() != NULL) {
        CEntity* penRayHit = GetPlayerWeapons()->m_penRayHit;
        if(penRayHit != NULL) {
          if (IsDerivedFromClass(penRayHit, "Enemy Base")) {
            CEnemyBase* enemyBase = ((CEnemyBase*)&*penRayHit);

            if (!enemyBase->m_bTemplate) {
              if (enemyBase->m_fMaxHealth >= h3d_fEnemyShowMaxHealth || h3d_fEnemyShowMaxHealth == 0.0f) { 
                iCount     = GetPlayerWeapons()->m_iEnemyHealth;
                iCountType = 1; // On Hearth Icon Boss
              }
            }
          }
        }
      }
      
  }
    // * END 3D HUD *******************************************************************************


  INDEX GenderSound(INDEX iSound)
  {
    return iSound+m_iGender*GENDEROFFSET;
  }

  void AddBouble( FLOAT3D vPos, FLOAT3D vSpeedRelative)
  {
    ShellLaunchData &sld = m_asldData[m_iFirstEmptySLD];
    sld.sld_vPos = vPos;
    const FLOATmatrix3D &m = GetRotationMatrix();
    FLOAT3D vUp( m(1,2), m(2,2), m(3,2));
    sld.sld_vUp = vUp;
    sld.sld_vSpeed = vSpeedRelative*m;
    sld.sld_tmLaunch = _pTimer->CurrentTick();
    sld.sld_estType = ESL_BUBBLE;
    // move to next shell position
    m_iFirstEmptySLD = (m_iFirstEmptySLD+1) % MAX_FLYING_SHELLS;
  }

  void ClearShellLaunchData( void)
  {
    // clear flying shells data array
    m_iFirstEmptySLD = 0;
    for( INDEX iShell=0; iShell<MAX_FLYING_SHELLS; iShell++)
    {
      m_asldData[iShell].sld_tmLaunch = -100.0f;
    }
  }

  void AddBulletSpray( FLOAT3D vPos, EffectParticlesType eptType, FLOAT3D vStretch)
  {
    BulletSprayLaunchData &bsld = m_absldData[m_iFirstEmptyBSLD];
    bsld.bsld_vPos = vPos;
    bsld.bsld_vG = en_vGravityDir;
    bsld.bsld_eptType=eptType;
    bsld.bsld_iRndBase=FRnd()*123456;
    bsld.bsld_tmLaunch = _pTimer->CurrentTick();
    bsld.bsld_vStretch=vStretch;
    // move to bullet spray position
    m_iFirstEmptyBSLD = (m_iFirstEmptyBSLD+1) % MAX_BULLET_SPRAYS;
  }

  void ClearBulletSprayLaunchData( void)
  {
    m_iFirstEmptyBSLD = 0;
    for( INDEX iBulletSpray=0; iBulletSpray<MAX_BULLET_SPRAYS; iBulletSpray++)
    {
      m_absldData[iBulletSpray].bsld_tmLaunch = -100.0f;
    }
  }

  void AddGoreSpray( FLOAT3D vPos, FLOAT3D v3rdPos, SprayParticlesType sptType, FLOAT3D vSpilDirection,
    FLOATaabbox3D boxHitted, FLOAT fDamagePower, COLOR colParticles)
  {
    GoreSprayLaunchData &gsld = m_agsldData[m_iFirstEmptyGSLD];
    gsld.gsld_vPos = vPos;
    gsld.gsld_v3rdPos = v3rdPos;
    gsld.gsld_vG = en_vGravityDir;
    gsld.gsld_fGA = en_fGravityA;
    gsld.gsld_sptType = sptType;
    gsld.gsld_boxHitted = boxHitted;
    gsld.gsld_vSpilDirection = vSpilDirection;
    gsld.gsld_fDamagePower=fDamagePower;
    gsld.gsld_tmLaunch = _pTimer->CurrentTick();
    gsld.gsld_colParticles = colParticles;
    // move to bullet spray position
    m_iFirstEmptyGSLD = (m_iFirstEmptyGSLD+1) % MAX_GORE_SPRAYS;
  }

  void ClearGoreSprayLaunchData( void)
  {
    m_iFirstEmptyGSLD = 0;
    for( INDEX iGoreSpray=0; iGoreSpray<MAX_GORE_SPRAYS; iGoreSpray++)
    {
      m_agsldData[iGoreSpray].gsld_tmLaunch = -100.0f;
    }
  }

  void CPlayer(void) 
  {
    // clear flying shells data array
    bUseButtonHeld = FALSE;
    ClearShellLaunchData();
    ClearBulletSprayLaunchData();
    ClearGoreSprayLaunchData();
    m_tmPredict = 0;

    // add all messages from First Encounter
    //CheatAllMessagesDir("Data\\Messages\\weapons\\", CMF_READ);
    //CheatAllMessagesDir("Data\\Messages\\enemies\\", CMF_READ);
    // ... or not
  }

  class CPlayerWeapons *GetPlayerWeapons(void)
  {
    ASSERT(m_penWeapons!=NULL);
    return (CPlayerWeapons *)&*m_penWeapons;
  }
  class CPlayerAnimator *GetPlayerAnimator(void)
  {
    ASSERT(m_penAnimator!=NULL);
    return (CPlayerAnimator *)&*m_penAnimator;
  }

  CPlayerSettings *GetSettings(void)
  {
    return (CPlayerSettings *)en_pcCharacter.pc_aubAppearance;
  }

  export void Copy(CEntity &enOther, ULONG ulFlags)
  {
    CPlayerEntity::Copy(enOther, ulFlags);
    CPlayer *penOther = (CPlayer *)(&enOther);
    m_moRender.Copy(penOther->m_moRender);
    m_psLevelStats = penOther->m_psLevelStats;
    m_psLevelTotal = penOther->m_psLevelTotal;
    m_psGameStats  = penOther->m_psGameStats ;
    m_psGameTotal  = penOther->m_psGameTotal ;

    anCurrentAmmo   = penOther->anCurrentAmmo;
    anCurrentScore  = penOther->anCurrentScore;
    anCurrentHealth = penOther->anCurrentHealth;
    anCurrentArmor  = penOther->anCurrentArmor;

    anCurrentShield = penOther->anCurrentShield;
    anCurrentMoney  = penOther->anCurrentMoney;

    // if creating predictor
    if (ulFlags&COPY_PREDICTOR)
    {
      // copy positions of launched empty shells
      memcpy( m_asldData, penOther->m_asldData, sizeof( m_asldData));
      m_iFirstEmptySLD = penOther->m_iFirstEmptySLD;
      // all messages in the inbox
      m_acmiMessages.Clear();
      m_ctUnreadMessages = penOther->m_ctUnreadMessages;
      //m_lsLightSource;
      SetupLightSource(); //? is this ok !!!!

    // if normal copying
    } else {
      // copy messages
      m_acmiMessages = penOther->m_acmiMessages;
      m_ctUnreadMessages = penOther->m_ctUnreadMessages;
    }
  }

  // update smoothed (average latency)
  void UpdateLatency(FLOAT tmLatencyNow)
  {
    TIME tmNow = _pTimer->GetHighPrecisionTimer().GetSeconds();

    // if not enough time passed
    if (tmNow<m_tmLatencyLastAvg+hud_tmLatencySnapshot) {
      // just sum
      m_tmLatencyAvgSum += tmLatencyNow;
      m_ctLatencyAvg++;

    // if enough time passed
    } else {
      // calculate average
      m_tmLatency = m_tmLatencyAvgSum/m_ctLatencyAvg;
      // reset counters
      m_tmLatencyAvgSum = 0.0f;
      m_ctLatencyAvg = 0;
      m_tmLatencyLastAvg = tmNow;
    }

    if (_pNetwork->IsPlayerLocal(this)) {
      en_tmPing = m_tmLatency;
      net_tmLatencyAvg = en_tmPing;
    }
  }

  // check character data for invalid values
  void ValidateCharacter(void)
  {
    // if in single player or flyover
    if (GetSP()->sp_bSinglePlayer) {
      // always use default model
      CPlayerSettings *pps = (CPlayerSettings *)en_pcCharacter.pc_aubAppearance;
      memset(pps->ps_achModelFile, 0, sizeof(pps->ps_achModelFile));
    }
  }
  // parse gender from your name
  void ParseGender(CTString &strName)
  {
    if (strName.RemovePrefix("#male#")) {
      m_iGender = GENDER_MALE;
    } else if (strName.RemovePrefix("#female#")) {
      m_iGender = GENDER_FEMALE;
    } else {
      m_iGender = GENDER_MALE;
    }
  }

  void CheckHighScore(void)
  {
    // if not playing a demo
    if (!_pNetwork->IsPlayingDemo()) {
      // update our local high score with the external
      if (plr_iHiScore>m_iHighScore) {
        m_iHighScore = plr_iHiScore;
      }
    }

    // if current score is better than highscore
    if (m_psGameStats.ps_iScore>m_iHighScore) {
      // if it is a highscore greater than the last one beaten
      if (m_iHighScore>m_iBeatenHighScore) {
        // remember that it was beaten
        m_iBeatenHighScore = m_iHighScore;
        // tell that to player
        //m_soHighScore.Set3DParameters(25.0f, 5.0f, 1.0f, 1.0f);
        //PlaySound(m_soHighScore, SOUND_HIGHSCORE, 0); !!!!####!!!!
      }
    }
  }

  CTString GetPredictName(void) const
  {
    if (IsPredicted()) {
      return "PREDICTED";
    } else if (IsPredictor()) {
      return "predictor";
    } else if (GetFlags()&ENF_WILLBEPREDICTED){
      return "WILLBEPREDICTED";
    } else {
      return "no prediction";
    }
  }
  /* Write to stream. */
  void Write_t( CTStream *ostr) // throw char *
  {
    CPlayerEntity::Write_t(ostr);
    // save array of messages
    ostr->WriteID_t("MSGS");
    INDEX ctMsg = m_acmiMessages.Count();
    (*ostr)<<ctMsg;
    for(INDEX iMsg=0; iMsg<ctMsg; iMsg++) {
      m_acmiMessages[iMsg].Write_t(*ostr);
    }
    ostr->Write_t(&m_psLevelStats, sizeof(m_psLevelStats));
    ostr->Write_t(&m_psLevelTotal, sizeof(m_psLevelTotal));
    ostr->Write_t(&m_psGameStats , sizeof(m_psGameStats ));
    ostr->Write_t(&m_psGameTotal , sizeof(m_psGameTotal ));

    // H3D ****************************************************
    ostr->Write_t(&anCurrentAmmo  , sizeof(anCurrentAmmo  ));
    ostr->Write_t(&anCurrentHealth, sizeof(anCurrentHealth));
    ostr->Write_t(&anCurrentArmor , sizeof(anCurrentArmor ));

    ostr->Write_t(&anCurrentShield, sizeof(anCurrentShield ));

    ostr->Write_t(&anCurrentScore , sizeof(anCurrentScore ));
    ostr->Write_t(&anCurrentMoney , sizeof(anCurrentMoney ));
    // H3D ****************************************************
  }
  /* Read from stream. */
  void Read_t( CTStream *istr) // throw char *
  { 
    CPlayerEntity::Read_t(istr);
    // clear flying shells data array
    ClearShellLaunchData();
    ClearBulletSprayLaunchData();
    ClearGoreSprayLaunchData();
    // load array of messages
    istr->ExpectID_t("MSGS");
    INDEX ctMsg;
    (*istr)>>ctMsg;
    m_acmiMessages.Clear();
    m_ctUnreadMessages = 0;
    if( ctMsg>0) {
      m_acmiMessages.Push(ctMsg);
      for(INDEX iMsg=0; iMsg<ctMsg; iMsg++) {
        m_acmiMessages[iMsg].Read_t(*istr);
        if (!m_acmiMessages[iMsg].cmi_bRead) {
          m_ctUnreadMessages++;
        }
      }
    }
    istr->Read_t(&m_psLevelStats, sizeof(m_psLevelStats));
    istr->Read_t(&m_psLevelTotal, sizeof(m_psLevelTotal));
    istr->Read_t(&m_psGameStats , sizeof(m_psGameStats ));
    istr->Read_t(&m_psGameTotal , sizeof(m_psGameTotal ));

    // H3D ****************************************************
    istr->Read_t(&anCurrentAmmo  , sizeof(anCurrentAmmo  ));
    istr->Read_t(&anCurrentHealth, sizeof(anCurrentHealth));
    istr->Read_t(&anCurrentArmor , sizeof(anCurrentArmor ));

    istr->Read_t(&anCurrentShield, sizeof(anCurrentShield ));

    istr->Read_t(&anCurrentScore , sizeof(anCurrentScore ));
    istr->Read_t(&anCurrentMoney , sizeof(anCurrentMoney ));
    // H3D ****************************************************

    SetHUD();

    __int64 milliseconds = _pTimer->GetHighPrecisionTimer().GetMilliseconds();
    anCurrentAmmo.tmLastTick   = milliseconds;
    anCurrentHealth.tmLastTick = milliseconds;
    anCurrentArmor.tmLastTick  = milliseconds;

    anCurrentShield.tmLastTick = milliseconds;

    anCurrentScore.tmLastTick  = milliseconds;
    anCurrentFrags.tmLastTick  = milliseconds;
    anCurrentDeaths.tmLastTick = milliseconds;
    anCurrentMana.tmLastTick   = milliseconds;
    anCurrentMoney.tmLastTick  = milliseconds;

    // set your real appearance if possible
    ValidateCharacter();
    CTString strDummy;
    SetPlayerAppearance(&m_moRender, &en_pcCharacter, strDummy, /*bPreview=*/FALSE);
    ParseGender(strDummy);
    m_ulFlags |= PLF_SYNCWEAPON;
    // setup light source
    SetupLightSource();
  };

  /* Get static light source information. */
  CLightSource *GetLightSource(void)
  {
    if (!IsPredictor()) {
      return &m_lsLightSource;
    } else {
      return NULL;
    }
  };

  // called by other entities to set time prediction parameter
  void SetPredictionTime(TIME tmAdvance)   // give time interval in advance to set
  {
    m_tmPredict = _pTimer->CurrentTick()+tmAdvance;
  }

  // called by engine to get the upper time limit 
  TIME GetPredictionTime(void)   // return moment in time up to which to predict this entity
  {
    return m_tmPredict;
  }

  // get maximum allowed range for predicting this entity
  FLOAT GetPredictionRange(void)
  {
    return cli_fPredictPlayersRange;
  }

  // add to prediction any entities that this entity depends on
  void AddDependentsToPrediction(void)
  {
    m_penWeapons->AddToPrediction();
    m_penAnimator->AddToPrediction();
    m_penView->AddToPrediction();
    m_pen3rdPersonView->AddToPrediction();
  }

  // get in-game time for statistics
  TIME GetStatsInGameTimeLevel(void)
  {
    if(m_bEndOfLevel) {
      return m_psLevelStats.ps_tmTime;
    } else {
      return _pNetwork->GetGameTime()-m_tmLevelStarted;
    }
  }
  TIME GetStatsInGameTimeGame(void)
  {
    if(m_bEndOfLevel) {
      return m_psGameStats.ps_tmTime;
    } else {
      return m_psGameStats.ps_tmTime + (_pNetwork->GetGameTime()-m_tmLevelStarted);
    }
  }

  FLOAT GetStatsRealWorldTime(void)
  {
    time_t timeNow;
    if(m_bEndOfLevel) { 
      timeNow = m_iEndTime; 
    } else {
      time(&timeNow);
    }
    return (FLOAT)difftime( timeNow, m_iStartTime);
  }

  CTString GetStatsRealWorldStarted(void)
  {
    struct tm *newtime;
    newtime = localtime(&m_iStartTime);

    setlocale(LC_ALL, "");
    CTString strTimeline;
    char achTimeLine[256]; 
    strftime( achTimeLine, sizeof(achTimeLine)-1, "%a %x %H:%M", newtime);
    strTimeline = achTimeLine;
    setlocale(LC_ALL, "C");
    return strTimeline;
  }

  // fill in player statistics
  export void GetStats( CTString &strStats, const CompStatType csType, INDEX ctCharsPerRow)
  {

    // get proper type of stats
    if( csType==CST_SHORT) {
      GetShortStats(strStats);
    } else {
      ASSERT(csType==CST_DETAIL);

      strStats = "\n";
      _ctAlignWidth = Min(ctCharsPerRow, INDEX(60));

      if (GetSP()->sp_bCooperative) {
        if (GetSP()->sp_bSinglePlayer) {
          GetDetailStatsSP(strStats, 0);
        } else {
          GetDetailStatsCoop(strStats);
        }
      } else {
        GetDetailStatsDM(strStats);
      }
    }
  }

  // get short one-line statistics - used for savegame descriptions and similar
  void GetShortStats(CTString &strStats)
  {
    strStats.PrintF( TRANS("%s %s Score: %d Kills: %d/%d"), 
                     GetDifficultyString(), TimeToString(GetStatsInGameTimeLevel()), 
                     m_psLevelStats.ps_iScore, m_psLevelStats.ps_iKills, m_psLevelTotal.ps_iKills);
  }

  // get detailed statistics for deathmatch game
  void GetDetailStatsDM(CTString &strStats)
  {
    extern INDEX SetAllPlayersStats( INDEX iSortKey);
    extern CPlayer *_apenPlayers[NET_MAXGAMEPLAYERS];
    // determine type of game
    const BOOL bFragMatch = GetSP()->sp_bUseFrags;

    // fill players table
    const INDEX ctPlayers = SetAllPlayersStats(bFragMatch?5:3); // sort by frags or by score

    // get time elapsed since the game start
    strStats+=AlignString(CTString(0, "^cFFFFFF%s:^r\n%s", TRANS("TIME"), TimeToString(_pNetwork->GetGameTime())));
    strStats+="\n";

    // find maximum frags/score that one player has
    INDEX iMaxFrags = LowerLimit(INDEX(0));
    INDEX iMaxScore = LowerLimit(INDEX(0));
    {for(INDEX iPlayer=0; iPlayer<ctPlayers; iPlayer++) {
      CPlayer *penPlayer = _apenPlayers[iPlayer];
      iMaxFrags = Max(iMaxFrags, penPlayer->m_psLevelStats.ps_iKills);
      iMaxScore = Max(iMaxScore, penPlayer->m_psLevelStats.ps_iScore);
    }}

    // print game limits
    const CSessionProperties &sp = *GetSP();
    if (sp.sp_iTimeLimit>0) {
      FLOAT fTimeLeft = ClampDn(sp.sp_iTimeLimit*60.0f - _pNetwork->GetGameTime(), 0.0f);
      strStats+=AlignString(CTString(0, "^cFFFFFF%s:^r\n%s", TRANS("TIME LEFT"), TimeToString(fTimeLeft)));
      strStats+="\n";
    }
    if (bFragMatch && sp.sp_iFragLimit>0) {
      INDEX iFragsLeft = ClampDn(sp.sp_iFragLimit-iMaxFrags, INDEX(0));
      strStats+=AlignString(CTString(0, "^cFFFFFF%s:^r\n%d", TRANS("FRAGS LEFT"), iFragsLeft));
      strStats+="\n";
    }
    if (!bFragMatch && sp.sp_iScoreLimit>0) {
      INDEX iScoreLeft = ClampDn(sp.sp_iScoreLimit-iMaxScore, INDEX(0));
      strStats+=AlignString(CTString(0, "^cFFFFFF%s:^r\n%d", TRANS("SCORE LEFT"), iScoreLeft));
      strStats+="\n";
    }
    strStats += "\n";

    CTString strRank = TRANS("NO.");
    CTString strFrag = bFragMatch ? TRANS("FRAGS"):TRANS("SCORE");
    CTString strPing = TRANS("PING");
    CTString strName = TRANS("PLAYER");
    INDEX ctRankChars = Max(strRank.Length(), INDEX(3)) ;
    INDEX ctFragChars = Max(strFrag.Length(), INDEX(7)) ;
    INDEX ctPingChars = Max(strPing.Length(), INDEX(5)) ;
    INDEX ctNameChars = Max(strName.Length(), INDEX(20));

    // header
    strStats += "^cFFFFFF";
    strStats += PadStringRight(strRank, ctRankChars)+" ";
    strStats += PadStringLeft (strFrag, ctFragChars)+" ";
    strStats += PadStringLeft (strPing, ctPingChars)+" ";
    strStats += PadStringRight(strName, ctNameChars)+" ";
    strStats += "^r";
    strStats += "\n\n";
    {for(INDEX iPlayer=0; iPlayer<ctPlayers; iPlayer++) {
      CTString strLine;
      CPlayer *penPlayer = _apenPlayers[iPlayer];
      INDEX iPing = ceil(penPlayer->en_tmPing*1000.0f);
      INDEX iScore = bFragMatch ? penPlayer->m_psLevelStats.ps_iKills : penPlayer->m_psLevelStats.ps_iScore;
      CTString strName = penPlayer->GetPlayerName();

      strStats += PadStringRight(CTString(0, "%d", iPlayer+1), ctRankChars)+" ";
      strStats += PadStringLeft (CTString(0, "%d", iScore),    ctFragChars)+" ";
      strStats += PadStringLeft (CTString(0, "%d", iPing),     ctPingChars)+" ";
      strStats += PadStringRight(strName,                      ctNameChars)+" ";
      strStats += "\n";
    }}
  }

  // get singleplayer statistics
  void GetDetailStatsCoop(CTString &strStats)
  {
    // first put in your full stats
    strStats += "^b"+CenterString(TRANS("YOUR STATS"))+"^r\n";
    strStats+="\n";
    GetDetailStatsSP(strStats, 1);

    // get stats from all players
    extern INDEX SetAllPlayersStats( INDEX iSortKey);
    extern CPlayer *_apenPlayers[NET_MAXGAMEPLAYERS];
    const INDEX ctPlayers = SetAllPlayersStats(3); // sort by score

    // for each player
    PlayerStats psSquadLevel = PlayerStats();
    PlayerStats psSquadGame  = PlayerStats();
    {for( INDEX iPlayer=0; iPlayer<ctPlayers; iPlayer++) {
      CPlayer *penPlayer = _apenPlayers[iPlayer];
      // add values to squad stats
      ASSERT( penPlayer!=NULL);
      PlayerStats psLevel = penPlayer->m_psLevelStats;
      PlayerStats psGame  = penPlayer->m_psGameStats ;
      psSquadLevel.ps_iScore   += psLevel.ps_iScore   ;
      psSquadLevel.ps_iKills   += psLevel.ps_iKills   ;
      psSquadLevel.ps_iDeaths  += psLevel.ps_iDeaths  ;
      psSquadLevel.ps_iSecrets += psLevel.ps_iSecrets ;
      psSquadGame.ps_iScore    += psGame.ps_iScore   ;
      psSquadGame.ps_iKills    += psGame.ps_iKills   ;
      psSquadGame.ps_iDeaths   += psGame.ps_iDeaths  ;
      psSquadGame.ps_iSecrets  += psGame.ps_iSecrets ;
    }}

    // add squad stats
    strStats+="\n";
    strStats += "^b"+CenterString(TRANS("SQUAD TOTAL"))+"^r\n";
    strStats+="\n";
    strStats+=CTString(0, "^cFFFFFF%s^r", TranslateConst(en_pwoWorld->GetName(), 0));
    strStats+="\n";
    strStats+=AlignString(CTString(0, "  %s:\n%d", TRANS("SCORE"), psSquadLevel.ps_iScore));
    strStats+="\n";
    strStats+=AlignString(CTString(0, "  %s:\n%d", TRANS("DEATHS"), psSquadLevel.ps_iDeaths));
    strStats+="\n";
    strStats+=AlignString(CTString(0, "  %s:\n%d/%d", TRANS("KILLS"), psSquadLevel.ps_iKills, m_psLevelTotal.ps_iKills));
    strStats+="\n";
    strStats+=AlignString(CTString(0, "  %s:\n%d/%d", TRANS("SECRETS"), psSquadLevel.ps_iSecrets, m_psLevelTotal.ps_iSecrets));
    strStats+="\n";
    strStats+="\n";
    strStats+=CTString("^cFFFFFF")+TRANS("TOTAL")+"^r\n";
    strStats+=AlignString(CTString(0, "  %s:\n%d", TRANS("SCORE"), psSquadGame.ps_iScore));
    strStats+="\n";
    strStats+=AlignString(CTString(0, "  %s:\n%d", TRANS("DEATHS"), psSquadGame.ps_iDeaths));
    strStats+="\n";
    strStats+=AlignString(CTString(0, "  %s:\n%d/%d", TRANS("KILLS"), psSquadGame.ps_iKills, m_psGameTotal.ps_iKills));
    strStats+="\n";
    strStats+=AlignString(CTString(0, "  %s:\n%d/%d", TRANS("SECRETS"), psSquadGame.ps_iSecrets, m_psGameTotal.ps_iSecrets));
    strStats+="\n";
    strStats+="\n";


    strStats+="\n";
    strStats += "^b"+CenterString(TRANS("OTHER PLAYERS"))+"^r\n";
    strStats+="\n";

    // for each player
    {for(INDEX iPlayer=0; iPlayer<ctPlayers; iPlayer++) {
      CPlayer *penPlayer = _apenPlayers[iPlayer];
      // if this one
      if (penPlayer==this) {
        // skip it
        continue;
      }
      // add his stats short
      strStats+="^cFFFFFF"+CenterString(penPlayer->GetPlayerName())+"^r\n\n";
      penPlayer->GetDetailStatsSP(strStats, 2);
      strStats+="\n";
    }}
  }

  // get singleplayer statistics
  void GetDetailStatsSP(CTString &strStats, INDEX iCoopType)
  {
    if (iCoopType<=1) {
      if (m_bEndOfGame) {
        if (GetSP()->sp_gdGameDifficulty==CSessionProperties::GD_EXTREME) {
          strStats+=TRANS("^f4SERIOUS GAME FINISHED,\nMENTAL MODE IS NOW ENABLED!^F\n\n");
        } else if (GetSP()->sp_bMental) {
          strStats+=TRANS("^f4YOU HAVE MASTERED THE GAME!^F\n\n");
        }
      }
    }

    if (iCoopType<=1) {
      // report total score info
      strStats+=AlignString(CTString(0, "^cFFFFFF%s:^r\n%d", TRANS("TOTAL SCORE"), m_psGameStats.ps_iScore));
      strStats+="\n";
      strStats+=AlignString(CTString(0, "^cFFFFFF%s:^r\n%s", TRANS("DIFFICULTY"), GetDifficultyString()));
      strStats+="\n";
      strStats+=AlignString(CTString(0, "^cFFFFFF%s:^r\n%s", TRANS("STARTED"), GetStatsRealWorldStarted()));
      strStats+="\n";
      strStats+=AlignString(CTString(0, "^cFFFFFF%s:^r\n%s", TRANS("PLAYING TIME"), TimeToString(GetStatsRealWorldTime())));
      strStats+="\n";
      if( m_psGameStats.ps_iScore<=plr_iHiScore) {
        strStats+=AlignString(CTString(0, "^cFFFFFF%s:^r\n%d", TRANS("HI-SCORE"), plr_iHiScore));
      } else {
        strStats+=TRANS("YOU BEAT THE HI-SCORE!");
      }
      strStats+="\n\n";
    }

    // report this level statistics
    strStats+=CTString(0, "^cFFFFFF%s^r", TranslateConst(en_pwoWorld->GetName(), 0));
    strStats+="\n";
    if (iCoopType<=1) {
      if( m_bEndOfLevel) {
        strStats+=AlignString(CTString(0, "  %s:\n%s", TRANS("ESTIMATED TIME"), TimeToString(m_tmEstTime)));
        strStats+="\n";
        strStats+=AlignString(CTString(0, "  %s:\n%d", TRANS("TIME BONUS"), m_iTimeScore));
        strStats+="\n";
        strStats+="\n";
      }
//    } else {
//      strStats+=CTString("^cFFFFFF")+TRANS("THIS LEVEL")+"^r\n";
    }
    strStats+=AlignString(CTString(0, "  %s:\n%d", TRANS("SCORE"), m_psLevelStats.ps_iScore));
    strStats+="\n";
    strStats+=AlignString(CTString(0, "  %s:\n%d/%d", TRANS("KILLS"), m_psLevelStats.ps_iKills, m_psLevelTotal.ps_iKills));
    strStats+="\n";
    if (iCoopType>=1) {
      strStats+=AlignString(CTString(0, "  %s:\n%d", TRANS("DEATHS"), m_psLevelStats.ps_iDeaths, m_psLevelTotal.ps_iDeaths));
      strStats+="\n";
    }
    strStats+=AlignString(CTString(0, "  %s:\n%d/%d", TRANS("SECRETS"), m_psLevelStats.ps_iSecrets, m_psLevelTotal.ps_iSecrets));
    strStats+="\n";
    if (iCoopType<=1) {
      strStats+=AlignString(CTString(0, "  %s:\n%s", TRANS("TIME"), TimeToString(GetStatsInGameTimeLevel())));
      strStats+="\n";
    }
    strStats+="\n";

    // report total game statistics
    strStats+=CTString("^cFFFFFF")+TRANS("TOTAL")+"^r";
    strStats+="\n";
    strStats+=AlignString(CTString(0, "  %s:\n%d", TRANS("SCORE"), m_psGameStats.ps_iScore));
    strStats+="\n";
    strStats+=AlignString(CTString(0, "  %s:\n%d/%d", TRANS("KILLS"), m_psGameStats.ps_iKills, m_psGameTotal.ps_iKills));
    strStats+="\n";
    if (iCoopType>=1) {
      strStats+=AlignString(CTString(0, "  %s:\n%d", TRANS("DEATHS"), m_psGameStats.ps_iDeaths, m_psGameTotal.ps_iDeaths));
      strStats+="\n";
    }
    strStats+=AlignString(CTString(0, "  %s:\n%d/%d", TRANS("SECRETS"), m_psGameStats.ps_iSecrets, m_psGameTotal.ps_iSecrets));
    strStats+="\n";
    if (iCoopType<=1) {
      strStats+=AlignString(CTString(0, "  %s:\n%s", TRANS("GAME TIME"), TimeToString(GetStatsInGameTimeGame())));
      strStats+="\n";
    }
    strStats+="\n";
    
    // set per level outputs
    if (iCoopType<1) {
      if(m_strLevelStats!="") {
        strStats += CTString("^cFFFFFF")+TRANS("Per level statistics") +"^r\n\n" + m_strLevelStats;
      }
    }
  }

  // provide info for GameSpy enumeration
  void GetGameSpyPlayerInfo( INDEX iPlayer, CTString &strOut) 
  {
    CTString strKey;
    strKey.PrintF("\\player_%d\\%s", iPlayer, (const char*)GetPlayerName());
	  strOut+=strKey;
    if (GetSP()->sp_bUseFrags) {
      strKey.PrintF("\\frags_%d\\%d", iPlayer, m_psLevelStats.ps_iKills);
	    strOut+=strKey;
    } else {
      strKey.PrintF("\\frags_%d\\%d", iPlayer, m_psLevelStats.ps_iScore);
	    strOut+=strKey;
    }
    strKey.PrintF("\\ping_%d\\%d", iPlayer, INDEX(ceil(en_tmPing*1000.0f)));
    strOut+=strKey;
  };

  // check if message is in inbox
  BOOL HasMessage( const CTFileName &fnmMessage)
  {
    ULONG ulHash = fnmMessage.GetHash();
    INDEX ctMsg = m_acmiMessages.Count();
    for(INDEX iMsg=0; iMsg<ctMsg; iMsg++) {
      if (m_acmiMessages[iMsg].cmi_ulHash      == ulHash &&
          m_acmiMessages[iMsg].cmi_fnmFileName == fnmMessage) {
        return TRUE;
      }
    }
    return FALSE;
  }

  // receive a computer message and put it in inbox if not already there
  void ReceiveComputerMessage(const CTFileName &fnmMessage, ULONG ulFlags)
  {
    // if already received
    if (HasMessage(fnmMessage)) {
      // do nothing
      return;
    }
    // add it to array
    CCompMessageID &cmi = m_acmiMessages.Push();
    cmi.NewMessage(fnmMessage);
    cmi.cmi_bRead = ulFlags&CMF_READ;
    if (!(ulFlags&CMF_READ)) {
      m_ctUnreadMessages++;
      cmp_bUpdateInBackground = TRUE;
    }
    if (!(ulFlags&CMF_READ) && (ulFlags&CMF_ANALYZE)) {
      m_tmAnalyseEnd = _pTimer->CurrentTick()+2.0f;
      m_soMessage.Set3DParameters(25.0f, 5.0f, 1.0f, 1.0f);
      PlaySound(m_soMessage, SOUND_INFO, SOF_3D|SOF_VOLUMETRIC|SOF_LOCAL);
    }
  }

  void SayVoiceMessage(const CTFileName &fnmMessage)
  {
    if (GetSettings()->ps_ulFlags&PSF_NOQUOTES) {
      return;
    }
    SetSpeakMouthPitch();
    PlaySound( m_soSpeech, fnmMessage, SOF_3D|SOF_VOLUMETRIC);
  }

  // receive all messages in one directory - cheat
  void CheatAllMessagesDir(const CTString &strDir, ULONG ulFlags)
  {
    // list the directory
    CDynamicStackArray<CTFileName> afnmDir;
    MakeDirList(afnmDir, strDir, "*.txt", DLI_RECURSIVE);

    // for each file in the directory
    for (INDEX i=0; i<afnmDir.Count(); i++) {
      CTFileName fnm = afnmDir[i];
      // add the message
      ReceiveComputerMessage(fnm, ulFlags);
    }
  }

  // receive all messages - cheat
  void CheatAllMessages(void)
  {
    //CheatAllMessagesDir("Data\\Messages\\information\\");
    //CheatAllMessagesDir("Data\\Messages\\background\\");
    //CheatAllMessagesDir("Data\\Messages\\statistics\\");
    CheatAllMessagesDir("Data\\Messages\\weapons\\", 0);
    CheatAllMessagesDir("Data\\Messages\\enemies\\", 0);
    CheatAllMessagesDir("DataMP\\Messages\\enemies\\", 0);
    CheatAllMessagesDir("DataMP\\Messages\\information\\", 0);
    CheatAllMessagesDir("DataMP\\Messages\\statistics\\", 0);
    CheatAllMessagesDir("DataMP\\Messages\\weapons\\", 0);
    CheatAllMessagesDir("DataMP\\Messages\\background\\", 0);
  }

  // mark that an item was picked
  void ItemPicked(const CTString &strName, FLOAT fAmmount)
  {
    // if nothing picked too long
    if (_pTimer->CurrentTick() > m_tmLastPicked+PICKEDREPORT_TIME) {
      // kill the name
      m_strPickedName = "";
      // reset picked mana
      m_fPickedMana = 0;
    }
    // if different than last picked
    if (m_strPickedName!=strName) {
      // remember name
      m_strPickedName = strName;
      // reset picked ammount
      m_fPickedAmmount = 0;
    }
    // increase ammount
    m_fPickedAmmount+=fAmmount;
    m_tmLastPicked = _pTimer->CurrentTick();
  }

  // Setup light source
  void SetupLightSource(void)
  {
    // setup light source
    CLightSource lsNew;
    lsNew.ls_ulFlags = LSF_NONPERSISTENT|LSF_DYNAMIC;
    lsNew.ls_rHotSpot = 1.0f;
    lsNew.ls_colColor = C_WHITE;
    lsNew.ls_rFallOff = 2.5f;
    lsNew.ls_plftLensFlare = NULL;
    lsNew.ls_ubPolygonalMask = 0;
    lsNew.ls_paoLightAnimation = &m_aoLightAnimation;

    m_lsLightSource.ls_penEntity = this;
    m_lsLightSource.SetLightSource(lsNew);
  };

  // play light animation
  void PlayLightAnim(INDEX iAnim, ULONG ulFlags) {
    if (m_aoLightAnimation.GetData()!=NULL) {
      m_aoLightAnimation.PlayAnim(iAnim, ulFlags);
    }
  };


  BOOL AdjustShadingParameters(FLOAT3D &vLightDirection, COLOR &colLight, COLOR &colAmbient) 
  {
    if( cht_bDumpPlayerShading)
    {
      ANGLE3D a3dHPB;
      DirectionVectorToAngles(-vLightDirection, a3dHPB);
      UBYTE ubAR, ubAG, ubAB;
      UBYTE ubCR, ubCG, ubCB;
      ColorToRGB(colAmbient, ubAR, ubAG, ubAB);
      ColorToRGB(colLight, ubCR, ubCG, ubCB);
      CPrintF("Ambient: %d,%d,%d, Color: %d,%d,%d, Direction HPB (%g,%g,%g)\n",
        ubAR, ubAG, ubAB, ubCR, ubCG, ubCB, a3dHPB(1), a3dHPB(2), a3dHPB(3));
    }

    // make models at least a bit bright in deathmatch
    if (!GetSP()->sp_bCooperative) {
      UBYTE ubH, ubS, ubV;
      ColorToHSV(colAmbient, ubH, ubS, ubV);
      if (ubV<22) {
        ubV = 22;
        colAmbient = HSVToColor(ubH, ubS, ubV);
      }      
    }

    return CPlayerEntity::AdjustShadingParameters(vLightDirection, colLight, colAmbient);
  };

  // get a different model object for rendering
  CModelObject *GetModelForRendering(void)
  {
    // if not yet initialized
    if(!(m_ulFlags&PLF_INITIALIZED)) { 
      // return base model
      return GetModelObject();
    }

    // lerp player viewpoint
    CPlacement3D plView;
    plView.Lerp(en_plLastViewpoint, en_plViewpoint, _pTimer->GetLerpFactor());
    // body and head attachment animation
    ((CPlayerAnimator&)*m_penAnimator).BodyAndHeadOrientation(plView);
    ((CPlayerAnimator&)*m_penAnimator).OnPreRender();
    // synchronize your appearance with the default model
    m_moRender.Synchronize(*GetModelObject());
    if (m_ulFlags&PLF_SYNCWEAPON) {
      m_ulFlags &= ~PLF_SYNCWEAPON;
      GetPlayerAnimator()->SyncWeapon();
    }

    FLOAT tmNow = _pTimer->GetLerpedCurrentTick();

    FLOAT fFading = 1.0f;
    if (m_tmFadeStart!=0) {
      FLOAT fFactor = (tmNow-m_tmFadeStart)/5.0f;
      fFactor = Clamp(fFactor, 0.0f, 1.0f);
      fFading*=fFactor;
    }

    // if invunerable after spawning
    FLOAT tmSpawnInvulnerability = GetSP()->sp_tmSpawnInvulnerability;
    if (tmSpawnInvulnerability>0 && tmNow-m_tmSpawned<tmSpawnInvulnerability) {
      // blink fast
      FLOAT fDelta = tmNow-m_tmSpawned;
      fFading *= 0.75f+0.25f*Sin(fDelta/0.5f*360);
    }

    COLOR colAlpha = m_moRender.mo_colBlendColor;
    colAlpha = (colAlpha&0xffffff00) + (COLOR(fFading*0xff)&0xff);
    m_moRender.mo_colBlendColor = colAlpha;

    // if not connected
    if (m_ulFlags&PLF_NOTCONNECTED) {
      // pulse slowly
      fFading *= 0.25f+0.25f*Sin(tmNow/2.0f*360);
    // if invisible
    } else if (m_tmInvisibility>tmNow) {
      FLOAT fIntensity=0.0f;
      if((m_tmInvisibility-tmNow)<3.0f)
      {
        fIntensity = 0.5f-0.5f*cos((m_tmInvisibility-tmNow)*(6.0f*3.1415927f/3.0f));
      }
      if (_ulPlayerRenderingMask == 1<<GetMyPlayerIndex()) {
        colAlpha = (colAlpha&0xffffff00)|(INDEX)(INVISIBILITY_ALPHA_LOCAL+(FLOAT)(254-INVISIBILITY_ALPHA_LOCAL)*fIntensity);
      } else if (TRUE) {
        if ((m_tmInvisibility-tmNow)<1.28f) {
          colAlpha = (colAlpha&0xffffff00)|(INDEX)(INVISIBILITY_ALPHA_REMOTE+(FLOAT)(254-INVISIBILITY_ALPHA_REMOTE)*fIntensity);
        } else if (TRUE) {
          colAlpha = (colAlpha&0xffffff00)|INVISIBILITY_ALPHA_REMOTE;
        }
      }
      m_moRender.mo_colBlendColor = colAlpha;
    }

    // use the appearance for rendering
    return &m_moRender;
  }

  // wrapper for action marker getting
  class CPlayerActionMarker *GetActionMarker(void) {
    return (CPlayerActionMarker *)&*m_penActionMarker;
  }

  // find main music holder if not remembered
  void FindMusicHolder(void)
  {
    if (m_penMainMusicHolder==NULL) {
      m_penMainMusicHolder = _pNetwork->GetEntityWithName("MusicHolder", 0);
    }
	if (m_penWorldLinkController==NULL && GetSP()->sp_bCooperative && !GetSP()->sp_bSinglePlayer) {
      m_penWorldLinkController = _pNetwork->GetEntityWithName("World link controller", 0);
	  if (m_penWorldLinkController==NULL) {
		CEntityPointer penWorldLinkController = CreateEntity(GetPlacement(), CLASS_WORLDLINKCONTROLLER);
		penWorldLinkController->Initialize();
		m_penWorldLinkController=penWorldLinkController;
	  }
    }
  }

  // update per-level stats
  void UpdateLevelStats(void)
  {
    // clear stats for this level
    m_psLevelStats = PlayerStats();

    // get music holder
    if (m_penMainMusicHolder==NULL) {
      return;
    }
    CMusicHolder &mh = (CMusicHolder&)*m_penMainMusicHolder;

    // assure proper count enemies in current world
    if (mh.m_ctEnemiesInWorld==0) {
      mh.CountEnemies();
    }
    // set totals for level and increment for game
    m_psLevelTotal.ps_iKills = mh.m_ctEnemiesInWorld;
    m_psGameTotal.ps_iKills += mh.m_ctEnemiesInWorld;
    m_psLevelTotal.ps_iSecrets = mh.m_ctSecretsInWorld;
    m_psGameTotal.ps_iSecrets += mh.m_ctSecretsInWorld;
  }

  // check if there is fuss
  BOOL IsFuss(void)
  {
    // if no music holder
    if (m_penMainMusicHolder==NULL) {
      // no fuss
      return FALSE;
    }
    // if no enemies - no fuss
    return ((CMusicHolder*)&*m_penMainMusicHolder)->m_cenFussMakers.Count()>0;
  }

  void SetDefaultMouthPitch(void)
  {
    m_soMouth.Set3DParameters(50.0f, 10.0f, 1.0f, 1.0f);
  }
  void SetRandomMouthPitch(FLOAT fMin, FLOAT fMax)
  {
    m_soMouth.Set3DParameters(50.0f, 10.0f, 1.0f, Lerp(fMin, fMax, FRnd()));
  }
  void SetSpeakMouthPitch(void)
  {
    m_soSpeech.Set3DParameters(50.0f, 10.0f, 2.0f, 1.0f);
  }
  void SetRandomShieldPitch(FLOAT fMin, FLOAT fMax)
  {
    m_soShield.Set3DParameters(10.0f, 10.0f, 2.0f, Lerp(fMin, fMax, FRnd()));
  }

  // added: also shake view because of chainsaw firing
  void ApplyShaking(CPlacement3D &plViewer)
  {
    // chainsaw shaking
    FLOAT fT = _pTimer->GetLerpedCurrentTick();
    if (fT<m_tmChainShakeEnd)
    {
      m_fChainsawShakeDX = 0.03f*m_fChainShakeStrength*SinFast(fT*m_fChainShakeFreqMod*3300.0f);
      m_fChainsawShakeDY = 0.03f*m_fChainShakeStrength*SinFast(fT*m_fChainShakeFreqMod*2900.0f);
      
      plViewer.pl_PositionVector(1) += m_fChainsawShakeDX;
      plViewer.pl_PositionVector(3) += m_fChainsawShakeDY;
    }

    CWorldSettingsController *pwsc = GetWSC(this);
    if (pwsc==NULL || pwsc->m_tmShakeStarted<0) {
      return;
    }

    TIME tm = _pTimer->GetLerpedCurrentTick()-pwsc->m_tmShakeStarted;
    if (tm<0) {
      return;
    }
    FLOAT fDistance = (plViewer.pl_PositionVector-pwsc->m_vShakePos).Length();
    FLOAT fIntensity = IntensityAtDistance(pwsc->m_fShakeFalloff, 0, fDistance);
    FLOAT fShakeY, fShakeB, fShakeZ;
    if (!pwsc->m_bShakeFadeIn) {
      fShakeY = SinFast(tm*pwsc->m_tmShakeFrequencyY*360.0f)*
        exp(-tm*(pwsc->m_fShakeFade))*
        fIntensity*pwsc->m_fShakeIntensityY;
      fShakeB = SinFast(tm*pwsc->m_tmShakeFrequencyB*360.0f)*
        exp(-tm*(pwsc->m_fShakeFade))*
        fIntensity*pwsc->m_fShakeIntensityB;
      fShakeZ = SinFast(tm*pwsc->m_tmShakeFrequencyZ*360.0f)*
        exp(-tm*(pwsc->m_fShakeFade))*
        fIntensity*pwsc->m_fShakeIntensityZ;
    } else {
      FLOAT ootm = 1.0f/tm;
      fShakeY = SinFast(tm*pwsc->m_tmShakeFrequencyY*360.0f)*
        exp((tm-2)*ootm*(pwsc->m_fShakeFade))*
        fIntensity*pwsc->m_fShakeIntensityY;
      fShakeB = SinFast(tm*pwsc->m_tmShakeFrequencyB*360.0f)*
        exp((tm-2)*ootm*(pwsc->m_fShakeFade))*
        fIntensity*pwsc->m_fShakeIntensityB;
      fShakeZ = SinFast(tm*pwsc->m_tmShakeFrequencyZ*360.0f)*
        exp((tm-2)*ootm*(pwsc->m_fShakeFade))*
        fIntensity*pwsc->m_fShakeIntensityZ;
    }
    plViewer.pl_PositionVector(2) += fShakeY;
    plViewer.pl_PositionVector(3) += fShakeZ;
    plViewer.pl_OrientationAngle(3) += fShakeB;
    
  }
// * H3D - SHAKE HUD AFTER RECEIVE DAMAGE *********************************************************
  void ApplyShakingFromDamage() {
    // no shaking when no damage
    if (m_fDamageTaken <= 0.0f) {
      return;
    }
     
    m_fDamageTaken = Min(50.0f, m_fDamageTaken);

    PIX2D shake = H3D_Shake(m_fDamageTaken, 10, 5, _pTimer->GetLerpedCurrentTick());
    m_vDamageShakeOffset(1) = shake(1)/600.0f;
    m_vDamageShakeOffset(2) = shake(2)/600.0f;

    if (!GetSP()->sp_bSinglePlayer) {
      m_fDamageTaken -= 1.0f;
    } else {
      m_fDamageTaken -= 0.25f;
    }

    if (m_fDamageTaken < 1) { m_fDamageTaken = 0; }
  }


  COLOR GetWorldGlaring(void)
  {
    CWorldSettingsController *pwsc = GetWSC(this);
    if (pwsc==NULL || pwsc->m_tmGlaringStarted<0) {
      return 0;
    }
    TIME tm = _pTimer->GetLerpedCurrentTick();
    FLOAT fRatio = CalculateRatio(tm, pwsc->m_tmGlaringStarted, pwsc->m_tmGlaringEnded,
      pwsc->m_fGlaringFadeInRatio,  pwsc->m_fGlaringFadeOutRatio);
    COLOR colResult = (pwsc->m_colGlade&0xFFFFFF00)|(UBYTE(fRatio*255.0f));
    return colResult;
  }

  void RenderScroll(CDrawPort *pdp)
  {
    CWorldSettingsController *pwsc = GetWSC(this);
    if( pwsc!=NULL && pwsc->m_penScrollHolder!=NULL)
    {
      CScrollHolder &sch = (CScrollHolder &) *pwsc->m_penScrollHolder;
      sch.Credits_Render(&sch, pdp);
    }
  }

  void RenderCredits(CDrawPort *pdp)
  {
    CWorldSettingsController *pwsc = GetWSC(this);
    if( pwsc!=NULL && pwsc->m_penCreditsHolder!=NULL)
    {
      CCreditsHolder &cch = (CCreditsHolder &) *pwsc->m_penCreditsHolder;
      cch.Credits_Render(&cch, pdp);
    }
  }
  
  void RenderTextFX(CDrawPort *pdp)
  {
    CWorldSettingsController *pwsc = GetWSC(this);
    if( pwsc!=NULL && pwsc->m_penTextFXHolder!=NULL)
    {
      CTextFXHolder &tfx = (CTextFXHolder &) *pwsc->m_penTextFXHolder;
      tfx.TextFX_Render(&tfx, pdp);
    }
  }

  void RenderHudPicFX(CDrawPort *pdp)
  {
    CWorldSettingsController *pwsc = GetWSC(this);
    if( pwsc!=NULL && pwsc->m_penHudPicFXHolder!=NULL)
    {
      CHudPicHolder &hpfx = (CHudPicHolder &) *pwsc->m_penHudPicFXHolder;
      hpfx.HudPic_Render(&hpfx, pdp);
    }
  }

/************************************************************
 *                    RENDER GAME VIEW                      *
 ************************************************************/

  // setup viewing parameters for viewing from player or camera
  void SetupView(CDrawPort *pdp, CAnyProjection3D &apr, CEntity *&penViewer, 
    CPlacement3D &plViewer, COLOR &colBlend, BOOL bCamera)
  {
    // read the exact placement of the view for this tick
    GetLerpedAbsoluteViewPlacement(plViewer);
    ASSERT(IsValidFloat(plViewer.pl_OrientationAngle(1))&&IsValidFloat(plViewer.pl_OrientationAngle(2))&&IsValidFloat(plViewer.pl_OrientationAngle(3)) );
    // get current entity that the player views from
    penViewer = GetViewEntity();

    INDEX iViewState = m_iViewState;
    
    if (m_penCamera!=NULL && bCamera) {
      iViewState = PVT_SCENECAMERA;
      plViewer = m_penCamera->GetLerpedPlacement();
      penViewer = m_penCamera;
    }

    // init projection parameters
    CPerspectiveProjection3D prPerspectiveProjection;
    plr_fFOV = Clamp( plr_fFOV, 1.0f, 160.0f);
    ANGLE aFOV = plr_fFOV;
    // disable zoom in deathmatch
    if (!GetSP()->sp_bCooperative) {
      aFOV = 90.0f;
    }
    // if sniper active
    if (((CPlayerWeapons&)*m_penWeapons).m_iCurrentWeapon==WEAPON_SNIPER)
    {
      aFOV = Lerp(((CPlayerWeapons&)*m_penWeapons).m_fSniperFOVlast,
                  ((CPlayerWeapons&)*m_penWeapons).m_fSniperFOV,
                  _pTimer->GetLerpFactor());
    }

    if (m_pstState==PST_DIVE && iViewState == PVT_PLAYEREYES) {
      TIME tmNow = _pTimer->GetLerpedCurrentTick();
      aFOV+=sin(tmNow*0.79f)*2.0f;
    }
    ApplyShaking(plViewer);

    colBlend = 0;
    if (iViewState == PVT_SCENECAMERA) {
      CCamera *pcm = (CCamera*)&*m_penCamera;
      prPerspectiveProjection.FOVL() = 
        Lerp(pcm->m_fLastFOV, pcm->m_fFOV, _pTimer->GetLerpFactor());
      if (pcm->m_tmDelta>0.001f) {
        FLOAT fFactor = (_pTimer->GetLerpedCurrentTick()-pcm->m_tmAtMarker)/pcm->m_tmDelta;
        fFactor = Clamp( fFactor, 0.0f, 1.0f);
        colBlend = LerpColor( pcm->m_colFade0, pcm->m_colFade1, fFactor);
      } else {
        colBlend = pcm->m_colFade0;
      }
    } else {
      prPerspectiveProjection.FOVL() = aFOV;
    }
    prPerspectiveProjection.ScreenBBoxL() = FLOATaabbox2D(
      FLOAT2D(0.0f, 0.0f),
      FLOAT2D((FLOAT)pdp->GetWidth(), (FLOAT)pdp->GetHeight())
    );
    // determine front clip plane
    plr_fFrontClipDistance = Clamp( plr_fFrontClipDistance, 0.05f, 0.50f);
    FLOAT fFCD = plr_fFrontClipDistance;
    // adjust front clip plane if swimming
    if( m_pstState==PST_SWIM && iViewState==PVT_PLAYEREYES) { fFCD *= 0.6666f; }
    prPerspectiveProjection.FrontClipDistanceL() = fFCD;
    prPerspectiveProjection.AspectRatioL() = 1.0f;
    // set up viewer position
    apr = prPerspectiveProjection;
    apr->ViewerPlacementL() = plViewer;
    apr->ObjectPlacementL() = CPlacement3D(FLOAT3D(0,0,0), ANGLE3D(0,0,0));
    prPlayerProjection = apr;
    prPlayerProjection->Prepare();
  }

  // listen from a given viewer
  void ListenFromEntity(CEntity *penListener, const CPlacement3D &plSound)
  {
    FLOATmatrix3D mRotation;
    MakeRotationMatrixFast(mRotation, plSound.pl_OrientationAngle);
    sliSound.sli_vPosition = plSound.pl_PositionVector;
    sliSound.sli_mRotation = mRotation;
    sliSound.sli_fVolume = 1.0f;
    sliSound.sli_vSpeed = en_vCurrentTranslationAbsolute;
    sliSound.sli_penEntity = penListener;
    if (m_pstState == PST_DIVE) {
      sliSound.sli_fFilter = 20.0f;
    } else {
      sliSound.sli_fFilter = 0.0f;
    }
    INDEX iEnv = 0;

    CBrushSector *pbsc = penListener->GetSectorFromPoint(plSound.pl_PositionVector);

    // for each sector around listener
    if (pbsc!=NULL) {
      iEnv = pbsc->GetEnvironmentType();
    }

    // get the environment
    CEnvironmentType &et = GetWorld()->wo_aetEnvironmentTypes[iEnv];
    sliSound.sli_iEnvironmentType = et.et_iType;
    sliSound.sli_fEnvironmentSize = et.et_fSize;
    _pSound->Listen(sliSound);
  }

  // render dummy view (not connected yet)
  void RenderDummyView(CDrawPort *pdp)
  {
    // clear screen
    pdp->Fill(C_BLACK|CT_OPAQUE);
	static CTextureObject _toBCG;
	try {
		_toBCG.SetData_t(_pNetwork->ga_fnmWorld.NoExt()+".bcg");
		((CTextureData*)_toBCG.GetData())->Force(TEX_CONSTANT);
		static PIXaabbox2D _boxScreen_SE;
		_boxScreen_SE = PIXaabbox2D ( PIX2D(0,0), PIX2D(pdp->GetWidth(), pdp->GetHeight()));
		pdp->PutTexture(&_toBCG, _boxScreen_SE, C_WHITE|255);	
	} catch (char* strError){};
    
    // if not single player
    if (!GetSP()->sp_bSinglePlayer) {
      // print a message
      PIX pixDPWidth  = pdp->GetWidth();
      PIX pixDPHeight = pdp->GetHeight();
      FLOAT fScale = (FLOAT)pixDPWidth/640.0f;
	  FLOAT fScaleh= (FLOAT)pixDPHeight/480.0f;
	  INDEX iGameOptionPosX= pixDPWidth*0.05f;
	  INDEX iPlayerListPosX= pixDPWidth*0.75f;
	  const INDEX iHeightSpacing=  20;
      pdp->SetFont( _pfdDisplayFont);
      pdp->SetTextScaling( fScale);
      pdp->SetTextAspect( 1.0f);
	  pdp->PutTextCXY(TranslateConst(en_pwoWorld->GetName(), 0), pixDPWidth*0.5f, pixDPHeight*0.05f, SE_COL_WHITE|CT_OPAQUE);
      pdp->PutTextCXY(TRANS("Players"), iPlayerListPosX, pixDPHeight*0.1f, SE_COL_BLUE_NEUTRAL_LT|CT_OPAQUE);
	  pdp->PutText(TRANS("Game options"), iGameOptionPosX, pixDPHeight*0.1f, SE_COL_BLUE_NEUTRAL_LT|CT_OPAQUE);
	  INDEX iDisplayedOption=0;
	  

	  		  CTString strGameDifficulty;
			  INDEX iDifficulty=(GetSP()->sp_gdGameDifficulty);
			  if (iDifficulty==-1) {
				  strGameDifficulty = TRANS("Tourist");
			  }
			    switch (iDifficulty) {
					case  0: strGameDifficulty = TRANS("Easy")   ; break;
					case  1: strGameDifficulty = TRANS("Normal") ; break;
					case  2: strGameDifficulty = TRANS("Hard")   ; break;
					case  3: strGameDifficulty = TRANS("Serious"); break;
				}
				strGameDifficulty.PrintF(TRANS("Difficulty: %s"), strGameDifficulty);
			    pdp->PutText(strGameDifficulty , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;

		  if (GetSP()->sp_bCooperative) {

			  if (GetSP()->sp_bUseExtraEnemies) {
				pdp->PutText(TRANS("Extra enemies") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (!GetSP()->sp_bWeaponsStay) {
				pdp->PutText(TRANS("Weapons disappear after picking") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (!GetSP()->sp_bAmmoStays) {
				pdp->PutText(TRANS("Ammo disappears after picking") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (!GetSP()->sp_bHealthArmorStays) {
				pdp->PutText(TRANS("Health and armor disappears after picking") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (GetSP()->sp_ctCredits!=-1) {
				  CTString str;
				  if (GetSP()->sp_ctCredits==0) {
					str.PrintF(TRANS("^cff9900Respawn credits: None"));
					pdp->PutText(str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				  } else {
				  str.PrintF(TRANS("Respawn credits: %d"), GetSP()->sp_ctCredits);
				  pdp->PutText(str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				  }
				iDisplayedOption++;
			  }
			  if (GetSP()->sp_bFriendlyFire) {
				pdp->PutText(TRANS("^cff9900Friendly fire") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (GetSP()->sp_fExtraEnemyStrength>0) {
				  INDEX i=GetSP()->sp_fExtraEnemyStrength*100;
				  CTString str;
				  str.PrintF(TRANS("Extra enemy strength: %d%s"), i,"%");
				pdp->PutText(str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (GetSP()->sp_fExtraEnemyStrengthPerPlayer>0) {
				  INDEX i=GetSP()->sp_fExtraEnemyStrengthPerPlayer*100;
				  CTString str;
				  str.PrintF(TRANS("Enemy strength per player: %d%s"), i,"%");
				pdp->PutText(str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (!GetSP()->sp_bPlayEntireGame) {
				pdp->PutText(TRANS("Play only at the current level") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (!GetSP()->sp_bRespawnInPlace) {
				pdp->PutText(TRANS("Players reborn on control point") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }

		  }
		  if (GetSP()->sp_gmGameMode == CSessionProperties::GM_FRAGMATCH||GetSP()->sp_gmGameMode == CSessionProperties::GM_SCOREMATCH)
		  {
			  if (!GetSP()->sp_bAllowHealth) {
				pdp->PutText(TRANS("No health") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (!GetSP()->sp_bAllowArmor) {
				pdp->PutText(TRANS("No Armor") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (GetSP()->sp_iTimeLimit>0) {
				  INDEX i=GetSP()->sp_iTimeLimit;
				  CTString str;
				  str.PrintF(TRANS("Time limit: %d%s"), i," minutes");
				pdp->PutText (str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (GetSP()->sp_iFragLimit>0) {
				CTString str;
				str.PrintF(TRANS("Frag limit: %d"), GetSP()->sp_iFragLimit);
				pdp->PutText(str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (GetSP()->sp_iScoreLimit>0) {
				CTString str;
				str.PrintF(TRANS("Score limit: %d"), GetSP()->sp_iScoreLimit);
				pdp->PutText(str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }

		  }
		if (GetSP()->sp_tmSpawnInvulnerability>0) {
			CTString str;
			str.PrintF(TRANS("Invulnerable after spawning (sec): %d"), (INDEX)GetSP()->sp_tmSpawnInvulnerability);
			pdp->PutText(str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
			iDisplayedOption++;
		/*} else {
			pdp->PutText(TRANS("No respawn"), iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
			iDisplayedOption++;*/
		}
		if (GetSP()->sp_bInfiniteAmmo) {
			pdp->PutText(TRANS("Infinite ammo") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
			iDisplayedOption++;
		}
    if (GetSP()->sp_bGiveExtraShield) {
			pdp->PutText(TRANS("Extra Shield reward") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
			iDisplayedOption++;
		}
    if (GetSP()->sp_fStartMaxShield>0) {
      CTString str;
      str.PrintF(TRANS("Shields on start: %d"), (INDEX)GetSP()->sp_fStartMaxShield);
			pdp->PutText(str , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
			iDisplayedOption++;
		}



      for (INDEX iPlayer=0, iDisplayedPlayer=0; iPlayer<GetMaxPlayers(); iPlayer++) {
		CPlayer *penPlayer = (CPlayer*)GetPlayerEntity(iPlayer);
		if (penPlayer != NULL) {
			pdp->PutTextCXY( penPlayer->GetPlayerName(), iPlayerListPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedPlayer*fScaleh), SE_COL_WHITE|CT_OPAQUE);
			iDisplayedPlayer++;
		}
	  }
    }
  }

  // render view from player
  void RenderPlayerView(CDrawPort *pdp, BOOL bShowExtras)
  {
    if (GetSP()->sp_bSinglePlayer) {
      UpdateHUD();
      ApplyShakingFromDamage();
    }

    CAnyProjection3D apr;
    CEntity *penViewer;
    CPlacement3D plViewer;
    COLOR colBlend;

    // for each eye
    for (INDEX iEye=STEREO_LEFT; iEye<=(Stereo_IsEnabled()?STEREO_RIGHT:STEREO_LEFT); iEye++) {

      // setup view settings
      SetupView(pdp, apr, penViewer, plViewer, colBlend, FALSE);

      // setup stereo rendering
      Stereo_SetBuffer(iEye);
      Stereo_AdjustProjection(*apr, iEye, 1);

      // render the view
      ASSERT(IsValidFloat(plViewer.pl_OrientationAngle(1))&&IsValidFloat(plViewer.pl_OrientationAngle(2))&&IsValidFloat(plViewer.pl_OrientationAngle(3)));
      _ulPlayerRenderingMask = 1<<GetMyPlayerIndex();
      RenderView(*en_pwoWorld, *penViewer, apr, *pdp);
      _ulPlayerRenderingMask = 0;

      if (iEye==STEREO_LEFT) {
        // listen from here
        ListenFromEntity(this, plViewer);
      }

      RenderScroll(pdp);
      RenderTextFX(pdp);
      RenderCredits(pdp);
      RenderHudPicFX(pdp);

	  if(hud_bShowAll && bShowExtras) {

        // let the player entity render its interface
        CPlacement3D plLight(_vViewerLightDirection, ANGLE3D(0,0,0));
        plLight.AbsoluteToRelative(plViewer);
        RenderHUD( *(CPerspectiveProjection3D *)(CProjection3D *)apr, pdp, 
          plLight.pl_PositionVector, _colViewerLight, _colViewerAmbient, 
          penViewer==this && (GetFlags()&ENF_ALIVE), iEye);
      }
    }
    Stereo_SetBuffer(STEREO_BOTH);

    // determine and cache main drawport, size and relative scale
    PIX pixDPWidth  = pdp->GetWidth();
    PIX pixDPHeight = pdp->GetHeight();
    FLOAT fScale = (FLOAT)pixDPWidth/640.0f;

    // print center message
    if (_pTimer->CurrentTick()<m_tmCenterMessageEnd) {
      pdp->SetFont( _pfdDisplayFont);
      pdp->SetTextScaling( fScale);
      pdp->SetTextAspect( 1.0f);
      pdp->PutTextCXY( m_strCenterMessage, pixDPWidth*0.5f, pixDPHeight*0.85f, C_WHITE|0xDD);
    // print picked item
    } else if (_pTimer->CurrentTick()<m_tmLastPicked+PICKEDREPORT_TIME) {
      pdp->SetFont( _pfdDisplayFont);
      pdp->SetTextScaling( fScale);
      pdp->SetTextAspect( 1.0f);
      CTString strPicked;
      if (m_fPickedAmmount==0) {
        strPicked = m_strPickedName;
      } else {
        strPicked.PrintF("%s +%d", m_strPickedName, int(m_fPickedAmmount));
      }
      pdp->PutTextCXY( strPicked, pixDPWidth*0.5f, pixDPHeight*0.82f, C_WHITE|0xDD);
      if (!GetSP()->sp_bCooperative && !GetSP()->sp_bUseFrags && m_fPickedMana>=1) {
        CTString strValue;
        strValue.PrintF("%s +%d", TRANS("Value"), INDEX(m_fPickedMana));
        pdp->PutTextCXY( strValue, pixDPWidth*0.5f, pixDPHeight*0.85f, C_WHITE|0xDD);
      }
    }

    if (_pTimer->CurrentTick()<m_tmAnalyseEnd) {
      pdp->SetFont( _pfdDisplayFont);
      pdp->SetTextScaling( fScale);
      pdp->SetTextAspect( 1.0f);
      UBYTE ubA = int(sin(_pTimer->CurrentTick()*10.0f)*127+128);
      pdp->PutTextCXY( TRANS("Analyzing..."), pixDPWidth*0.5f, pixDPHeight*0.2f, SE_COL_BLUE_NEUTRAL_LT|ubA);
    }
  }

  // render view from camera
  void RenderCameraView(CDrawPort *pdp, BOOL bListen)
  {

    if (GetSP()->sp_bSinglePlayer) {
      UpdateHUD();
      ApplyShakingFromDamage();
    }

    CDrawPort dpCamera;
    CDrawPort *pdpCamera = pdp;
    if (m_penCamera!=NULL && ((CCamera&)*m_penCamera).m_bWideScreen) {
      pdp->MakeWideScreen(&dpCamera);
      pdpCamera = &dpCamera;
    }

    pdp->Unlock();
    pdpCamera->Lock();

    CAnyProjection3D apr;
    CEntity *penViewer;
    CPlacement3D plViewer;
    COLOR colBlend;

    // for each eye
    for (INDEX iEye=STEREO_LEFT; iEye<=(Stereo_IsEnabled()?STEREO_RIGHT:STEREO_LEFT); iEye++) {

      // setup view settings
      SetupView(pdpCamera, apr, penViewer, plViewer, colBlend, TRUE);

      // setup stereo rendering
      Stereo_SetBuffer(iEye);
      Stereo_AdjustProjection(*apr, iEye, 1);

      // render the view
      ASSERT(IsValidFloat(plViewer.pl_OrientationAngle(1))&&IsValidFloat(plViewer.pl_OrientationAngle(2))&&IsValidFloat(plViewer.pl_OrientationAngle(3)));
      _ulPlayerRenderingMask = 1<<GetMyPlayerIndex();
      RenderView(*en_pwoWorld, *penViewer, apr, *pdpCamera);
      _ulPlayerRenderingMask = 0;

      // listen from there if needed
      if (bListen && iEye==STEREO_LEFT) {
        ListenFromEntity(penViewer, plViewer);
      }

      if(hud_bShowAll && ((CCamera*)&*m_penCamera)->m_bRenderPlayerHUD) {
        // let the player entity render its interface
        CPlacement3D plLight(_vViewerLightDirection, ANGLE3D(0,0,0));
        plLight.AbsoluteToRelative(plViewer);


        if(IsPredicted()) {
          ((CPlayer*)GetPredictor())->RenderH3D( *(CPerspectiveProjection3D *)(CProjection3D *)apr, pdp, 
            plLight.pl_PositionVector, _colViewerLight, _colViewerAmbient, FALSE, iEye);
        }
        else {
          RenderH3D( *(CPerspectiveProjection3D *)(CProjection3D *)apr, pdp, 
            plLight.pl_PositionVector, _colViewerLight, _colViewerAmbient, FALSE, iEye);
        }
      }
    }
    Stereo_SetBuffer(STEREO_BOTH);

    RenderScroll(pdpCamera);
    RenderTextFX(pdpCamera);
    RenderCredits(pdpCamera);
    RenderHudPicFX(pdpCamera);

    // add world glaring
    {
      COLOR colGlare = GetWorldGlaring();
      UBYTE ubR, ubG, ubB, ubA;
      ColorToRGBA(colGlare, ubR, ubG, ubB, ubA);
      if (ubA!=0) {
        pdpCamera->dp_ulBlendingRA += ULONG(ubR)*ULONG(ubA);
        pdpCamera->dp_ulBlendingGA += ULONG(ubG)*ULONG(ubA);
        pdpCamera->dp_ulBlendingBA += ULONG(ubB)*ULONG(ubA);
        pdpCamera->dp_ulBlendingA  += ULONG(ubA);
      }
      // do all queued screen blendings
      pdpCamera->BlendScreen();
    }

    pdpCamera->Unlock();
    pdp->Lock();

    // camera fading
    if ((colBlend&CT_AMASK)!=0) {
      pdp->Fill(colBlend);
    }

    // print center message
    if (_pTimer->CurrentTick()<m_tmCenterMessageEnd) {
      PIX pixDPWidth  = pdp->GetWidth();
      PIX pixDPHeight = pdp->GetHeight();
      FLOAT fScale = (FLOAT)pixDPWidth/640.0f;
      pdp->SetFont( _pfdDisplayFont);
      pdp->SetTextScaling( fScale);
      pdp->SetTextAspect( 1.0f);
      pdp->PutTextCXY( m_strCenterMessage, pixDPWidth*0.5f, pixDPHeight*0.85f, C_WHITE|0xDD);
    }
  }


  void RenderGameView(CDrawPort *pdp, void *pvUserData)
  {
    BOOL bShowExtras = (ULONG(pvUserData)&GRV_SHOWEXTRAS);
    pdp->Unlock();

    // if not yet initialized
    if(!(m_ulFlags&PLF_INITIALIZED) || (m_ulFlags&PLF_DONTRENDER)) { 
      // render dummy view on the right drawport
      CDrawPort dpView(pdp, TRUE);
      if(dpView.Lock()) {
        RenderDummyView(&dpView);
        dpView.Unlock();
      }
      pdp->Lock();
      return; 
    }

    // if rendering real game view (not thumbnail, or similar)
    if (pvUserData!=0) {
      // if rendered a game view recently
      CTimerValue tvNow = _pTimer->GetHighPrecisionTimer();
      if ((tvNow-_tvProbingLast).GetSeconds()<0.1) {
        // allow probing
        _pGfx->gl_bAllowProbing = TRUE;
      }
      _tvProbingLast = tvNow;
    }

    //CPrintF("%s: render\n", GetPredictName());

    // check for dualhead
    BOOL bDualHead = 
      pdp->IsDualHead() && 
      GetSP()->sp_gmGameMode!=CSessionProperties::GM_FLYOVER &&
      m_penActionMarker==NULL;

    // if dualhead, or no camera active
    if (bDualHead||m_penCamera==NULL) {
      // make left player view
      CDrawPort dpView(pdp, TRUE);
      if(dpView.Lock()) {
        // draw it
        RenderPlayerView(&dpView, bShowExtras);
        dpView.Unlock();
      }
    }

    // if camera active
    if (m_penCamera!=NULL) {
      // make left or right camera view
      CDrawPort dpView(pdp, m_penActionMarker!=NULL);
      if(dpView.Lock()) {
        // draw it, listen if not dualhead
        RenderCameraView(&dpView, !bDualHead);
        dpView.Unlock();
      }
    // if camera is not active
    } else {
      // if dualhead
      if (bDualHead) {
        // render computer on secondary display
        cmp_ppenDHPlayer = this;
      }
    }
    // all done - lock back the original drawport
    pdp->Lock();
  };




/************************************************************
 *                   PRE/DO/POST MOVING                     *
 ************************************************************/

  // premoving for soft player up-down movement
  void PreMoving(void) {


    ((CPlayerAnimator&)*m_penAnimator).StoreLast();
    CPlayerEntity::PreMoving();
  };

  // do moving
  void DoMoving(void) {
    CPlayerEntity::DoMoving();
    ((CPlayerAnimator&)*m_penAnimator).AnimateBanking();

    if (m_penView!=NULL) {
      ((CPlayerView&)*m_penView).DoMoving();
    }
    if (m_pen3rdPersonView!=NULL) {
      ((CPlayerView&)*m_pen3rdPersonView).DoMoving();
    }
  };


  // postmoving for soft player up-down movement
  void PostMoving(void)
  {
    CPlayerEntity::PostMoving();
    // never allow a player to be removed from the list of movers
    en_ulFlags &= ~ENF_INRENDERING;

    
    ((CPlayerAnimator&)*m_penAnimator).AnimateSoftEyes();
    //((CPlayerAnimator&)*m_penAnimator).AnimateRecoilPitch();

    // slowly increase mana with time, faster if player is not moving; (only if alive)
    if (GetFlags()&ENF_ALIVE)
    {
      m_fManaFraction += 
        ClampDn( 1.0f-en_vCurrentTranslationAbsolute.Length()/20.0f, 0.0f) * 20.0f
        * _pTimer->TickQuantum;
      INDEX iNewMana = m_fManaFraction;
      m_iMana         += iNewMana;
      m_fManaFraction -= iNewMana;
    }

    // if in tourist mode
    if (GetSP()->sp_gdGameDifficulty==CSessionProperties::GD_TOURIST && GetFlags()&ENF_ALIVE) {
      // slowly increase health with time
      FLOAT fHealth = GetHealth();
      FLOAT fTopHealth = TopHealth();
      if (fHealth<fTopHealth) {
        SetHealth(ClampUp(fHealth+_pTimer->TickQuantum, fTopHealth));  // one unit per second
      }
    }

	
    if (m_tmLastDamage+m_fShieldDelay < _pTimer->CurrentTick() && GetFlags()&ENF_ALIVE) { //h3d Shield regen
      m_fShield=ClampUp(m_fShield+_pTimer->TickQuantum+(m_fMaxShield/300.0f), m_fMaxShield);
	  }

    // update ray hit for weapon target
    GetPlayerWeapons()->UpdateTargetingInfo();

    if (m_pen3rdPersonView!=NULL) {
      ((CPlayerView&)*m_pen3rdPersonView).PostMoving();
    }
    if (m_penView!=NULL) {
      ((CPlayerView&)*m_penView).PostMoving();
    }

    // if didn't have any action in this tick
    if (!(m_ulFlags&PLF_APPLIEDACTION)) {
      // means we are not connected
      SetUnconnected();
    }

    // clear action indicator
    m_ulFlags&=~PLF_APPLIEDACTION;
  }

  // set player parameters for unconnected state (between the server loads and player reconnects)
  void SetUnconnected(void)
  {
    if (m_ulFlags&PLF_NOTCONNECTED) {
      return;
    }
    m_ulFlags |= PLF_NOTCONNECTED;

    // reset to a dummy state
    ForceFullStop();
    SetPhysicsFlags(GetPhysicsFlags() & ~(EPF_TRANSLATEDBYGRAVITY|EPF_ORIENTEDBYGRAVITY));
    SetCollisionFlags(GetCollisionFlags() & ~((ECBI_BRUSH|ECBI_MODEL)<<ECB_TEST));
    en_plLastViewpoint.pl_OrientationAngle = en_plViewpoint.pl_OrientationAngle = ANGLE3D(0,0,0);

    StartModelAnim(PLAYER_ANIM_STAND, 0);
    GetPlayerAnimator()->BodyAnimationTemplate(
      BODY_ANIM_NORMALWALK, BODY_ANIM_COLT_STAND, BODY_ANIM_SHOTGUN_STAND, BODY_ANIM_MINIGUN_STAND, 
      AOF_LOOPING|AOF_NORESTART);
  }

  // set player parameters for connected state
  void SetConnected(void)
  {
    if (!(m_ulFlags&PLF_NOTCONNECTED)) {
      return;
    }
    m_ulFlags &= ~PLF_NOTCONNECTED;

    SetPhysicsFlags(GetPhysicsFlags() | (EPF_TRANSLATEDBYGRAVITY|EPF_ORIENTEDBYGRAVITY));
    SetCollisionFlags(GetCollisionFlags() | ((ECBI_BRUSH|ECBI_MODEL)<<ECB_TEST));
  }

  // check if player is connected or not
  BOOL IsConnected(void) const
  {
    return !(m_ulFlags&PLF_NOTCONNECTED);
  }

  // create a checksum value for sync-check
  void ChecksumForSync(ULONG &ulCRC, INDEX iExtensiveSyncCheck)
  {
    CPlayerEntity::ChecksumForSync(ulCRC, iExtensiveSyncCheck);
    CRC_AddLONG(ulCRC, m_psLevelStats.ps_iScore);
    CRC_AddLONG(ulCRC, m_iMana);
    if (iExtensiveSyncCheck>0) {
      CRC_AddFLOAT(ulCRC, m_fManaFraction);
    }
    CRC_AddFLOAT(ulCRC, m_fArmor);
  }


  // dump sync data to text file
  void DumpSync_t(CTStream &strm, INDEX iExtensiveSyncCheck)  // throw char *
  {
    CPlayerEntity::DumpSync_t(strm, iExtensiveSyncCheck);
    strm.FPrintF_t("Score: %d\n", m_psLevelStats.ps_iScore);
    strm.FPrintF_t("m_iMana:  %d\n", m_iMana);
    strm.FPrintF_t("m_fManaFraction: %g(%08x)\n", m_fManaFraction, (ULONG&)m_fManaFraction);
    strm.FPrintF_t("m_fArmor: %g(%08x)\n", m_fArmor, (ULONG&)m_fArmor);
  }

/************************************************************
 *         DAMAGE OVERRIDE (PLAYER HAS ARMOR)               *
 ************************************************************/


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


  void DamageImpact(enum DamageType dmtType,
                  FLOAT fDamageAmmount, const FLOAT3D &vHitPoint, const FLOAT3D &vDirection)
  {
    // if exploded
    if (GetRenderType()!=RT_MODEL) {
      // do nothing
      return;
    }

    if (dmtType == DMT_ABYSS || dmtType == DMT_SPIKESTAB) {
      return;
    }

    fDamageAmmount = Clamp(fDamageAmmount, 0.0f, 5000.0f);

    FLOAT fKickDamage = fDamageAmmount;
    if( (dmtType == DMT_EXPLOSION) || (dmtType == DMT_IMPACT) || (dmtType == DMT_CANNONBALL_EXPLOSION) )
    {
      fKickDamage*=1.5;
    }
    if (dmtType==DMT_DROWNING || dmtType==DMT_CLOSERANGE) {
      fKickDamage /= 10;
    }
    if (dmtType==DMT_CHAINSAW)
    {
      fKickDamage /= 10;
    }

    // get passed time since last damage
    TIME tmNow = _pTimer->CurrentTick();
    TIME tmDelta = tmNow-m_tmLastDamage;
    m_tmLastDamage = tmNow;

    // fade damage out
    if (tmDelta>=_pTimer->TickQuantum*3) {
      m_vDamage=FLOAT3D(0,0,0);
    }
    // add new damage
    FLOAT3D vDirectionFixed;
    if (vDirection.ManhattanNorm()>0.5f) {
      vDirectionFixed = vDirection;
    } else {
      vDirectionFixed = -en_vGravityDir;
    }
    FLOAT3D vDamageOld = m_vDamage;
    m_vDamage+=(vDirectionFixed/*-en_vGravityDir/2*/)*fKickDamage;
    
    FLOAT fOldLen = vDamageOld.Length();
    FLOAT fNewLen = m_vDamage.Length();
    FLOAT fOldRootLen = Sqrt(fOldLen);
    FLOAT fNewRootLen = Sqrt(fNewLen);

    FLOAT fMassFactor = 200.0f/((EntityInfo*)GetEntityInfo())->fMass;
    
    if( !(en_ulFlags & ENF_ALIVE))
    {
      fMassFactor /= 3;
    }

    switch( dmtType)
    {
    case DMT_CLOSERANGE:
    case DMT_CHAINSAW:
    case DMT_DROWNING:
    case DMT_IMPACT:
    case DMT_BRUSH:
    case DMT_BURNING:
      // do nothing
      break;
    default:
    {
      if(fOldLen != 0.0f)
      {
        // cancel last push
        GiveImpulseTranslationAbsolute( -vDamageOld/fOldRootLen*fMassFactor);
      }
      
      /*
      FLOAT3D vImpuls = m_vDamage/fNewRootLen*fMassFactor;
      CPrintF( "Applied absolute translation impuls: (%g%g%g)\n",
        vImpuls(1),vImpuls(2),vImpuls(3));*/

      // push it back
      GiveImpulseTranslationAbsolute( m_vDamage/fNewRootLen*fMassFactor);
    }
    }

    if( m_fMaxDamageAmmount<fDamageAmmount)
    {
      m_fMaxDamageAmmount = fDamageAmmount;
    }
    // if it has no spray, or if this damage overflows it
    if ((m_tmSpraySpawned<=_pTimer->CurrentTick()-_pTimer->TickQuantum*8 || 
      m_fSprayDamage+fDamageAmmount>50.0f)) {

      // spawn blood spray
      CPlacement3D plSpray = CPlacement3D( vHitPoint, ANGLE3D(0, 0, 0));
      m_penSpray = CreateEntity( plSpray, CLASS_BLOOD_SPRAY);
      m_penSpray->SetParent( this);
      ESpawnSpray eSpawnSpray;
      eSpawnSpray.colBurnColor=C_WHITE|CT_OPAQUE;
      
      if( m_fMaxDamageAmmount > 10.0f)
      {
        eSpawnSpray.fDamagePower = 3.0f;
      }
      else if(m_fSprayDamage+fDamageAmmount>50.0f)
      {
        eSpawnSpray.fDamagePower = 2.0f;
      }
      else
      {
        eSpawnSpray.fDamagePower = 1.0f;
      }

      eSpawnSpray.sptType = SPT_BLOOD;
      eSpawnSpray.fSizeMultiplier = 1.0f;

      // setup direction of spray
      FLOAT3D vHitPointRelative = vHitPoint - GetPlacement().pl_PositionVector;
      FLOAT3D vReflectingNormal;
      GetNormalComponent( vHitPointRelative, en_vGravityDir, vReflectingNormal);
      vReflectingNormal.Normalize();
      
      vReflectingNormal(1)/=5.0f;
    
      FLOAT3D vProjectedComponent = vReflectingNormal*(vDirection%vReflectingNormal);
      FLOAT3D vSpilDirection = vDirection-vProjectedComponent*2.0f-en_vGravityDir*0.5f;

      eSpawnSpray.vDirection = vSpilDirection;
      eSpawnSpray.penOwner = this;
    
      // initialize spray
      m_penSpray->Initialize( eSpawnSpray);
      m_tmSpraySpawned = _pTimer->CurrentTick();
      m_fSprayDamage = 0.0f;
      m_fMaxDamageAmmount = 0.0f;
    }
    m_fSprayDamage+=fDamageAmmount;
  }


  /* Receive damage */
  void ReceiveDamage( CEntity *penInflictor, enum DamageType dmtType,
                      FLOAT fDamageAmmount, const FLOAT3D &vHitPoint, const FLOAT3D &vDirection)
  {

    // don't harm yourself with knife or with rocket in easy/tourist mode
    if( penInflictor==this && (dmtType==DMT_CLOSERANGE || dmtType==DMT_CHAINSAW ||
        ((dmtType==DMT_EXPLOSION||dmtType==DMT_CANNONBALL_EXPLOSION||dmtType==DMT_PROJECTILE) &&
          GetSP()->sp_gdGameDifficulty<=CSessionProperties::GD_EASY)) ) {
      return;
    }

    // if not connected
    if (m_ulFlags&PLF_NOTCONNECTED) {
      // noone can harm you
      return;
    }

    // god mode -> no one can harm you
    if( cht_bGod && CheatsEnabled() ) { return; }

    // if invulnerable, nothing can harm you except telefrag or abyss
    const TIME tmDelta = m_tmInvulnerability - _pTimer->CurrentTick();
    if( tmDelta>0 && dmtType!=DMT_ABYSS && dmtType!=DMT_TELEPORT) { return; }

    // if invunerable after spawning
    FLOAT tmSpawnInvulnerability = GetSP()->sp_tmSpawnInvulnerability;
    if (tmSpawnInvulnerability>0 && _pTimer->CurrentTick()-m_tmSpawned<tmSpawnInvulnerability) {
      // ignore damage
      return;
    }

    // check for friendly fire
    if (!GetSP()->sp_bFriendlyFire && GetSP()->sp_bCooperative) {
      if (IsOfClass(penInflictor, "Player") && penInflictor!=this) {
        return;
      }
    }

    // ignore heat damage if dead
    if (dmtType==DMT_HEAT && !(GetFlags()&ENF_ALIVE)) {
      return;
    }

    // adjust for difficulty
    FLOAT fDifficultyDamage = GetSP()->sp_fDamageStrength;
    if( fDifficultyDamage<=1.0f || penInflictor!=this) {
      fDamageAmmount *= fDifficultyDamage;
    }

    // ignore zero damages
    if (fDamageAmmount<=0) {
      return;
    }
	
	// Shield H3D
	if (dmtType != DMT_DROWNING && dmtType != DMT_ABYSS && dmtType != DMT_SPIKESTAB && dmtType != DMT_TELEPORT && m_fShield > 0) {
	FLOAT fDamage=m_fShield-fDamageAmmount;
	FLOAT fShield=m_fShield;
	  m_fShield = Max(0.0f, fDamage);
	  m_tmLastDamage = _pTimer->CurrentTick();
	  m_h3dAppearTimeShield = Min(m_h3dAppearTimeShield + fDamageAmmount/10.0f, 10.0f);
    m_fBorderShield       = _pTimer->CurrentTick() + m_h3dAppearTimeShield;
	  if (fDamage<=0) {
      PlaySound(m_soShield, SOUND_SHIELD_BREAK, SOF_3D);
      m_tmShieldBroken=_pTimer->CurrentTick();
      m_vShieldBroken=GetPlacement().pl_PositionVector; // set the last player position for sapwn broken shield's particles
      m_vShieldBroken(2)+=1;
		  fDamageAmmount-=fShield;
      m_fShieldDamageAmmount=0;
      //m_fShieldBrokenAmmount=5;
		} else {
		  m_tmShieldWoundTime=_pTimer->CurrentTick();
		  m_fShieldDamageAmmount+=fDamageAmmount;

      if (m_fShieldDamageAmmount>1.0f) {
        if (GetFlags()&ENF_ALIVE) {
          // determine corresponding sound
          SetRandomShieldPitch( 0.9f, 1.1f);
          // give some pause inbetween screaming
          TIME tmNow = _pTimer->CurrentTick();
          if( (tmNow-m_tmShieldScreamTime) > 0.5f) {
            m_tmShieldScreamTime = tmNow;
            PlaySound(m_soShield, SOUND_SHIELD_HIT, SOF_3D);
          }
        }
      }

		  return;
		}
	}
  if (fDamageAmmount<=0) {
      return;
    }
		
    FLOAT fSubHealth, fSubArmor;
    if( dmtType == DMT_DROWNING) {
      // drowning
      fSubHealth = fDamageAmmount;
    }
    else {
      // damage and armor
      fSubArmor  = fDamageAmmount*2.0f/3.0f;      // 2/3 on armor damage
      fSubHealth = fDamageAmmount - fSubArmor;    // 1/3 on health damage
      m_fArmor  -= fSubArmor;                     // decrease armor
      if( m_fArmor<0) {                          // armor below zero -> add difference to health damage
        fSubHealth -= m_fArmor;
        m_fArmor    = 0.0f;
      }
    }

    FLOAT fRealArmorDamage = Min(fSubArmor, m_fArmor);

	// * H3D **************************************************************************************

	m_h3dAppearTimeArmor = Min(m_h3dAppearTimeArmor + fRealArmorDamage/10.0f, 10.0f);
    m_fBorderArmor       = _pTimer->CurrentTick() + m_h3dAppearTimeArmor;

    // if any damage
    if( fSubHealth>0) { 

      m_penShop = NULL;

      // if camera is active
      if (m_penCamera!=NULL) {
        // if the camera has onbreak
        CEntity *penOnBreak = ((CCamera&)*m_penCamera).m_penOnBreak;
        if (penOnBreak!=NULL) {
          // trigger it
          SendToTarget(penOnBreak, EET_TRIGGER, this);
        // if it doesn't
        } else {
          // just deactivate camera
          m_penCamera = NULL; 
        }
      }

    }

    // if the player is doing autoactions
    if (m_penActionMarker!=NULL) {
      // ignore all damage
      return;
    }

    DamageImpact(dmtType, fSubHealth, vHitPoint, vDirection);
    m_tmDamageShakeEnd = _pTimer->CurrentTick()+0.2f;
    m_fDamageShakePower = Min(fDamageAmmount/50.0f, 2.0f);

    // receive damage
    CPlayerEntity::ReceiveDamage( penInflictor, dmtType, fSubHealth, vHitPoint, vDirection);
	m_h3dAppearTime = Min(m_h3dAppearTime + fSubHealth/10.0f, 10.0f); //H3D Health border
    m_fBorderHealth = _pTimer->CurrentTick() + m_h3dAppearTime;

    m_fDamageTaken += fSubHealth;

    // red screen and hit translation
    if( fDamageAmmount>1.0f) {
// !!!! this is obsolete, DamageImpact is used instead!
      if( dmtType==DMT_EXPLOSION || dmtType==DMT_PROJECTILE || dmtType==DMT_BULLET
       || dmtType==DMT_IMPACT    || dmtType==DMT_CANNONBALL || dmtType==DMT_CANNONBALL_EXPLOSION) {
//        GiveImpulseTranslationAbsolute( vDirection*(fDamageAmmount/7.5f)
//                                        -en_vGravityDir*(fDamageAmmount/15.0f));
      }
      if( GetFlags()&ENF_ALIVE) {
        m_fDamageAmmount += fDamageAmmount;
        m_tmWoundedTime   = _pTimer->CurrentTick();
      }
    }

    // yell (this hurts)
    ESound eSound;
    eSound.EsndtSound = SNDT_PLAYER;
    eSound.penTarget  = this;
    SendEventInRange( eSound, FLOATaabbox3D( GetPlacement().pl_PositionVector, 10.0f));

    // play hurting sound
    if( dmtType==DMT_DROWNING) {
      SetRandomMouthPitch( 0.9f, 1.1f);
      PlaySound( m_soMouth, GenderSound(SOUND_DROWN), SOF_3D);
      if(_pNetwork->IsPlayerLocal(this)) {IFeel_PlayEffect("WoundWater");}
      m_tmMouthSoundLast = _pTimer->CurrentTick();
      PlaySound( m_soLocalAmbientOnce, SOUND_WATERBUBBLES, SOF_3D|SOF_VOLUMETRIC|SOF_LOCAL);
      m_soLocalAmbientOnce.Set3DParameters( 25.0f, 5.0f, 2.0f, Lerp(0.5f, 1.5f, FRnd()) );
      SpawnBubbles( 10+INDEX(FRnd()*10));
    } else if( m_fDamageAmmount>1.0f) {
      // if not dead
      if (GetFlags()&ENF_ALIVE) {
        // determine corresponding sound
        INDEX iSound;
        char *strIFeel = NULL;
        if( m_fDamageAmmount<5.0f) {
          iSound = GenderSound(SOUND_WOUNDWEAK);
          strIFeel = "WoundWeak";
        }
        else if( m_fDamageAmmount<25.0f) {
          iSound = GenderSound(SOUND_WOUNDMEDIUM);
          strIFeel = "WoundMedium";
        }
        else {
          iSound = GenderSound(SOUND_WOUNDSTRONG);
          strIFeel = "WoundStrong";
        }
        if( m_pstState==PST_DIVE) {
          iSound = GenderSound(SOUND_WOUNDWATER);
          strIFeel = "WoundWater";
        } // override for diving
        SetRandomMouthPitch( 0.9f, 1.1f);
        // give some pause inbetween screaming
        TIME tmNow = _pTimer->CurrentTick();
        if( (tmNow-m_tmScreamTime) > 1.0f) {
          m_tmScreamTime = tmNow;
          PlaySound( m_soMouth, iSound, SOF_3D);
          if(_pNetwork->IsPlayerLocal(this)) {IFeel_PlayEffect(strIFeel);}
        }
      }
    }    
  };

  // should this player blow up (spawn debris)
  BOOL ShouldBlowUp(void) 
  {
    // blow up if
    return
      // allowed
      GetSP()->sp_bGibs && 
      // dead and
      (GetHealth()<=0) && 
      // has received large enough damage lately and
      (m_vDamage.Length() > _fBlowUpAmmount) &&
      // is not blown up already
      GetRenderType()==RT_MODEL;
  };

  // spawn body parts
  void BlowUp(void)
  {
    FLOAT3D vNormalizedDamage = m_vDamage-m_vDamage*(_fBlowUpAmmount/m_vDamage.Length());
    vNormalizedDamage /= Sqrt(vNormalizedDamage.Length());
    vNormalizedDamage *= 0.75f;

    FLOAT3D vBodySpeed = en_vCurrentTranslationAbsolute-en_vGravityDir*(en_vGravityDir%en_vCurrentTranslationAbsolute);
    const FLOAT fBlowUpSize = 2.0f;

    // readout blood type
    const INDEX iBloodType = GetSP()->sp_iBlood;
    // determine debris texture (color)
    ULONG ulFleshTexture = TEXTURE_FLESH_GREEN;
    ULONG ulFleshModel   = MODEL_FLESH;
    if( iBloodType==2) { ulFleshTexture = TEXTURE_FLESH_RED; }
    // spawn debris
    Debris_Begin( EIBT_FLESH, DPT_BLOODTRAIL, BET_BLOODSTAIN, fBlowUpSize, vNormalizedDamage, vBodySpeed, 1.0f, 0.0f);
    for( INDEX iDebris=0; iDebris<4; iDebris++) {
      // flowerpower mode?
      if( iBloodType==3) {
        switch( IRnd()%5) {
        case 1:  { ulFleshModel = MODEL_FLESH_APPLE;   ulFleshTexture = TEXTURE_FLESH_APPLE;   break; }
        case 2:  { ulFleshModel = MODEL_FLESH_BANANA;  ulFleshTexture = TEXTURE_FLESH_BANANA;  break; }
        case 3:  { ulFleshModel = MODEL_FLESH_BURGER;  ulFleshTexture = TEXTURE_FLESH_BURGER;  break; }
        case 4:  { ulFleshModel = MODEL_FLESH_LOLLY;   ulFleshTexture = TEXTURE_FLESH_LOLLY;   break; }
        default: { ulFleshModel = MODEL_FLESH_ORANGE;  ulFleshTexture = TEXTURE_FLESH_ORANGE;  break; }
        }
      }
      Debris_Spawn( this, this, ulFleshModel, ulFleshTexture, 0, 0, 0, IRnd()%4, 0.5f,
                    FLOAT3D(FRnd()*0.6f+0.2f, FRnd()*0.6f+0.2f, FRnd()*0.6f+0.2f));
    }

    // leave a stain beneath
    LeaveStain(FALSE);

    PlaySound(m_soBody, SOUND_BLOWUP, SOF_3D);

    // hide yourself (must do this after spawning debris)
    SwitchToEditorModel();
    
    FLOAT fSpeedOrg = en_vCurrentTranslationAbsolute.Length();
    const FLOAT fSpeedMax = 30.0f;
    if (fSpeedOrg>fSpeedMax) {
      en_vCurrentTranslationAbsolute *= fSpeedMax/fSpeedOrg;
    }

//    SetPhysicsFlags(EPF_MODEL_IMMATERIAL);
//    SetCollisionFlags(ECF_IMMATERIAL);
  };

/************************************************************
 *                 OVERRIDEN FUNCTIONS                      *
 ************************************************************/
  /* Entity info */
  void *GetEntityInfo(void)
  {
    switch (m_pstState) {
      case PST_STAND: case PST_FALL:
        return &eiPlayerGround;
        break;
      case PST_CROUCH:
        return &eiPlayerCrouch;
        break;
      case PST_SWIM: case PST_DIVE:
        return &eiPlayerSwim;
        break;
    }
    return &eiPlayerGround;
  };


  /* Receive item */
  BOOL ReceiveItem(const CEntityEvent &ee)
  {
    // *********** HEALTH ***********
    if( ee.ee_slEvent == EVENTCODE_EHealth)
    {
      // determine old and new health values
      FLOAT fHealthOld = GetHealth();
      FLOAT fHealthNew = fHealthOld + ((EHealth&)ee).fHealth;
      if( ((EHealth&)ee).bOverTopHealth) {
        fHealthNew = ClampUp( fHealthNew, MaxHealth());
      } else {
        fHealthNew = ClampUp( fHealthNew, TopHealth());
      }

      // if value can be changed
      if( ceil(fHealthNew) > ceil(fHealthOld)) {
        // receive it
        SetHealth(fHealthNew);
        ItemPicked( TRANS("Health"), ((EHealth&)ee).fHealth);
        m_iMana += (INDEX)(((EHealth&)ee).fHealth);
        m_fPickedMana   += ((EHealth&)ee).fHealth;
        return TRUE;
      }
    } 

    // *********** ARMOR ***********
    else if( ee.ee_slEvent == EVENTCODE_EArmor)
    {
      // determine old and new health values
      FLOAT fArmorOld = m_fArmor;
      FLOAT fArmorNew = fArmorOld + ((EArmor&)ee).fArmor;
      if( ((EArmor&)ee).bOverTopArmor) {
        fArmorNew = ClampUp( fArmorNew, MaxArmor());
      } else {
        fArmorNew = ClampUp( fArmorNew, TopArmor());
      }
      // if value can be changed
      if( ceil(fArmorNew) > ceil(fArmorOld)) {
        // receive it
        m_fArmor = fArmorNew;
        ItemPicked( TRANS("Armor"), ((EArmor&)ee).fArmor);
        m_iMana += (INDEX)(((EArmor&)ee).fArmor);
        m_fPickedMana   += ((EArmor&)ee).fArmor;
        return TRUE;
      }
    }

    // *********** SHIELD ***********
    else if( ee.ee_slEvent == EVENTCODE_EMaxShield)
    {
      // determine old and new health values
      FLOAT fMaxShieldOld = m_fMaxShield;
      FLOAT fMaxShieldNew = fMaxShieldOld + ((EMaxShield&)ee).fMaxShield;

      // if value can be changed
      if( ceil(fMaxShieldNew) > ceil(fMaxShieldOld)) {
        // receive it
        m_fMaxShield = fMaxShieldNew;
        ItemPicked( TRANS("Energy shield"), ((EMaxShield&)ee).fMaxShield);
        m_iMana += (INDEX)(((EMaxShield&)ee).fMaxShield);
        m_fPickedMana   += ((EMaxShield&)ee).fMaxShield;
        return TRUE;
      }
    }

    // *********** MESSAGE ***********
    else if (ee.ee_slEvent == EVENTCODE_EMessageItem) {
      EMessageItem &eMI = (EMessageItem &)ee;
      ReceiveComputerMessage(eMI.fnmMessage, CMF_ANALYZE);
      ItemPicked(TRANS("Ancient papyrus"), 0);
      return TRUE;
    }

    // *********** WEAPON ***********
    else if (ee.ee_slEvent == EVENTCODE_EWeaponItem) {
      return ((CPlayerWeapons&)*m_penWeapons).ReceiveWeapon(ee);
    }

    // *********** MONEY ***********
    else if (ee.ee_slEvent == EVENTCODE_EMoneyItem) {
		if (((EMoneyItem&)ee).bPredictor) {return false;}
		INDEX iMoney=(INDEX)(((EMoneyItem&)ee).iMoney);
		if (((EMoneyItem&)ee).bDroppedByEnemy) {
			iMoney+=iMoney*(GetSP()->sp_fExtraEnemyStrength+
						    GetSP()->sp_fExtraEnemyStrengthPerPlayer*
							_pNetwork->ga_sesSessionState.GetPlayersCount());
		}
      m_iMoney += iMoney;//(INDEX)(((EMoneyItem&)ee).iMoney);
      ItemPicked( TRANS("Treasure"), iMoney);
      return TRUE;
    }

    // *********** AMMO ***********
    else if (ee.ee_slEvent == EVENTCODE_EAmmoItem) {
      return ((CPlayerWeapons&)*m_penWeapons).ReceiveAmmo(ee);
    }

    else if (ee.ee_slEvent == EVENTCODE_EAmmoPackItem) {
      return ((CPlayerWeapons&)*m_penWeapons).ReceivePackAmmo(ee);
    }

    // *********** KEYS ***********
    else if (ee.ee_slEvent == EVENTCODE_EKey) {
      // don't pick up key if in auto action mode
      if (m_penActionMarker!=NULL) {
        return FALSE;
      }
      // make key mask
      ULONG ulKey = 1<<INDEX(((EKey&)ee).kitType);
      EKey &eKey = (EKey&)ee;
      if(eKey.kitType == KIT_HAWKWINGS01DUMMY || eKey.kitType == KIT_HAWKWINGS02DUMMY
        || eKey.kitType == KIT_TABLESDUMMY || eKey.kitType ==KIT_JAGUARGOLDDUMMY)
      {
        ulKey = 0;
      }
      // if key is already in inventory
      if (m_ulKeys&ulKey) {
        // ignore it
        return FALSE;
      // if key is not in inventory
      } else {
        // pick it up
        m_ulKeys |= ulKey;
        CTString strKey = GetKeyName(((EKey&)ee).kitType);
        ItemPicked(strKey, 0);
        // if in cooperative
        if (GetSP()->sp_bCooperative && !GetSP()->sp_bSinglePlayer) {
          CPrintF(TRANS("^cFFFFFF%s - %s^r\n"), GetPlayerName(), strKey);
        }
        return TRUE;
      }
    }

    // *********** POWERUPS ***********
    else if( ee.ee_slEvent == EVENTCODE_EPowerUp) {
      const FLOAT tmNow = _pTimer->CurrentTick();
      switch( ((EPowerUp&)ee).puitType) {
      case PUIT_INVISIB :  m_tmInvisibility    = tmNow + m_tmInvisibilityMax;
        ItemPicked(TRANS("^cABE3FFInvisibility"), 0);
        return TRUE;
      case PUIT_INVULNER:  m_tmInvulnerability = tmNow + m_tmInvulnerabilityMax;
        ItemPicked(TRANS("^c00B440Invulnerability"), 0);
        return TRUE;
      case PUIT_DAMAGE  :  m_tmSeriousDamage   = tmNow + m_tmSeriousDamageMax;
        ItemPicked(TRANS("^cFF0000Serious Damage!"), 0);
        return TRUE;
      case PUIT_SPEED   :  m_tmSeriousSpeed    = tmNow + m_tmSeriousSpeedMax;
        ItemPicked(TRANS("^cFF9400Serious Speed"), 0);
        return TRUE;
      case PUIT_BOMB    :
        m_iSeriousBombCount++;
        ItemPicked(TRANS("^cFF0000Serious Bomb!"), 0);
        //ItemPicked(TRANS("^cFF0000S^cFFFF00e^cFF0000r^cFFFF00i^cFF0000o^cFFFF00u^cFF0000s ^cFF0000B^cFFFF00o^cFF0000m^cFFFF00b!"), 0);
        // send computer message
        if (GetSP()->sp_bCooperative) {
          EComputerMessage eMsg;
          eMsg.fnmMessage = CTFILENAME("DataMP\\Messages\\Weapons\\seriousbomb.txt");
          this->SendEvent(eMsg);
        }
        return TRUE;              
      }
    }

    // nothing picked
    return FALSE;
  };



  // Change Player view
  void ChangePlayerView()
  {
    // change from eyes to 3rd person
    if (m_iViewState == PVT_PLAYEREYES) {
      // spawn 3rd person view camera
      ASSERT(m_pen3rdPersonView == NULL);
      if (m_pen3rdPersonView == NULL) {
        m_pen3rdPersonView = CreateEntity(GetPlacement(), CLASS_PLAYER_VIEW);
        EViewInit eInit;
        eInit.penOwner = this;
        eInit.penCamera = NULL;
        eInit.vtView = VT_3RDPERSONVIEW;
        eInit.bDeathFixed = FALSE;
        m_pen3rdPersonView ->Initialize(eInit);
      }
      
      m_iViewState = PVT_3RDPERSONVIEW;

    // change from 3rd person to eyes
    } else if (m_iViewState == PVT_3RDPERSONVIEW) {
      m_iViewState = PVT_PLAYEREYES;

      // kill 3rd person view
      if (m_pen3rdPersonView != NULL) {
        ((CPlayerView&)*m_pen3rdPersonView).SendEvent(EEnd());
        m_pen3rdPersonView = NULL;
      }
    }
  };

  // if computer is pressed
  void ComputerPressed(void)
  {
    // call computer if not holding sniper
//    if (GetPlayerWeapons()->m_iCurrentWeapon!=WEAPON_SNIPER){
      if (cmp_ppenPlayer==NULL && _pNetwork->IsPlayerLocal(this)) {
        cmp_ppenPlayer = this;
      }
      m_bComputerInvoked = TRUE;
      // clear analyses message
      m_tmAnalyseEnd = 0;
      m_bPendingMessage = FALSE;
      m_tmMessagePlay = 0;
//    }
  }


  // if use is pressed
  void UsePressed(BOOL bOrComputer)
  {
    // cast ray from weapon
    CPlayerWeapons *penWeapons = GetPlayerWeapons();
    CEntity *pen = penWeapons->m_penRayHit;
    BOOL bSomethingToUse = FALSE;

    // if hit
    if (pen!=NULL) {
      // check switch/messageholder relaying by moving brush
      if (IsOfClass( pen, "Moving Brush")) {
        if (((CMovingBrush&)*pen).m_penSwitch!=NULL) {
          pen = ((CMovingBrush&)*pen).m_penSwitch;
        }
      }

      // if switch and near enough
      if (IsOfClass( pen, "Switch") && penWeapons->m_fRayHitDistance < 2.0f) {
        CSwitch &enSwitch = (CSwitch&)*pen;
        // if switch is useable
        if (enSwitch.m_bUseable) {
          // send it a trigger event
          SendToTarget(pen, EET_TRIGGER, this);
          bSomethingToUse = TRUE;
        }
      }

      // if analyzable
      if (IsOfClass( pen, "MessageHolder") 
        && penWeapons->m_fRayHitDistance<((CMessageHolder*)&*pen)->m_fDistance
        && ((CMessageHolder*)&*pen)->m_bActive) {
        const CTFileName &fnmMessage = ((CMessageHolder*)&*pen)->m_fnmMessage;
        // if player doesn't have that message in database
        if (!HasMessage(fnmMessage)) {
          // add the message
          ReceiveComputerMessage(fnmMessage, CMF_ANALYZE);
          bSomethingToUse = TRUE;
        }
      }
    }
    // if nothing usable under cursor, and may call computer
    if (!bSomethingToUse && bOrComputer) {
      // call computer
      ComputerPressed();
    }
    else if (!bSomethingToUse)
    {
      CPlayerWeapons *penWeapon = GetPlayerWeapons();
     
      // penWeapon->m_iWantedWeapon==WEAPON_SNIPER) =>
      // make sure that weapon transition is not in progress
      if (penWeapon->m_iCurrentWeapon==WEAPON_SNIPER && 
          penWeapon->m_iWantedWeapon==WEAPON_SNIPER) {
        if (m_ulFlags&PLF_ISZOOMING) {
          m_ulFlags&=~PLF_ISZOOMING;
          penWeapon->m_bSniping = FALSE;
          penWeapon->m_fSniperFOVlast = penWeapon->m_fSniperFOV = penWeapon->m_fSniperMaxFOV;      
          PlaySound(m_soSniperZoom, SOUND_SILENCE, SOF_3D);
          if(_pNetwork->IsPlayerLocal(this)) {IFeel_StopEffect("SniperZoom");}
        }
        else {
          penWeapon->m_bSniping = TRUE;
          m_ulFlags|=PLF_ISZOOMING;
          penWeapon->m_fSniperFOVlast = penWeapon->m_fSniperFOV = penWeapon->m_fMinimumZoomFOV;
          PlaySound(m_soSniperZoom, SOUND_SNIPER_ZOOM, SOF_3D|SOF_LOOP);
          if(_pNetwork->IsPlayerLocal(this)) {IFeel_PlayEffect("SniperZoom");}
        }
      }
    }
  }

  
/************************************************************
 *                      PLAYER ACTIONS                      *
 ************************************************************/
  void SetGameEnd(void)
  {
    _pNetwork->SetGameFinished();
    // start console for first player possible
    for(INDEX iPlayer=0; iPlayer<GetMaxPlayers(); iPlayer++) {
      CEntity *pen = GetPlayerEntity(iPlayer);
      if (pen!=NULL) {
        if (cmp_ppenPlayer==NULL && _pNetwork->IsPlayerLocal(pen)) {
          cmp_ppenPlayer = (CPlayer*)pen;
        }
      }
    }
  }
  // check if game should be finished
  void CheckGameEnd(void)
  {
    BOOL bFinished = FALSE;
    // if time limit is out
    INDEX iTimeLimit = GetSP()->sp_iTimeLimit;
    if (iTimeLimit>0 && _pTimer->CurrentTick()>=iTimeLimit*60.0f) {
      bFinished = TRUE;
    }
    // if frag limit is out
    INDEX iFragLimit = GetSP()->sp_iFragLimit;
    if (iFragLimit>0 && m_psLevelStats.ps_iKills>=iFragLimit) {
      bFinished = TRUE;
    }
    // if score limit is out
    INDEX iScoreLimit = GetSP()->sp_iScoreLimit;
    if (iScoreLimit>0 && m_psLevelStats.ps_iScore>=iScoreLimit) {
      bFinished = TRUE;
    }

    if (bFinished) {
      SetGameEnd();
    }
  }

  // Preapply the action packet for local mouselag elimination
  void PreapplyAction( const CPlayerAction &paAction)
  {
  }

  // Called to apply player action to player entity each tick.
  void ApplyAction( const CPlayerAction &paOriginal, FLOAT tmLatency)
  {
    if(!(m_ulFlags&PLF_INITIALIZED)) { return; }
//    CPrintF("---APPLY: %g\n", paOriginal.pa_aRotation(1));
    
    // if was not connected
    if (m_ulFlags&PLF_NOTCONNECTED) {
      // set connected state
      SetConnected();
    }
    // mark that the player is connected
    m_ulFlags |= PLF_APPLIEDACTION;

    // make a copy of action for adjustments
    CPlayerAction paAction = paOriginal;
    //CPrintF("applying(%s-%08x): %g\n", GetPredictName(), int(paAction.pa_llCreated),
    //  paAction.pa_vTranslation(3));

    // calculate delta from last received actions
    ANGLE3D aDeltaRotation     = paAction.pa_aRotation    -m_aLastRotation;
    ANGLE3D aDeltaViewRotation = paAction.pa_aViewRotation-m_aLastViewRotation;

    // Weapon inert
    m_aWeaponSwayOld = m_aWeaponSway;
    if (en_plViewpoint.pl_OrientationAngle(2) > -90 && en_plViewpoint.pl_OrientationAngle(2) < 90)
    {
      m_aWeaponSway(2) -= aDeltaRotation(2) * h3d_fWpnInertFactor;
    }
    m_aWeaponSway(1) -= aDeltaRotation(1) * h3d_fWpnInertFactor;
    m_aWeaponSway /= 2;

    // H3D inert
    m_aH3DSwayOld = m_aH3DSway;
    if (en_plViewpoint.pl_OrientationAngle(2) > -90 && en_plViewpoint.pl_OrientationAngle(2) < 90)
    {
      m_aH3DSway(2) -= aDeltaRotation(2) * h3d_fHUDInertFactor;
    }
    m_aH3DSway(1) -= aDeltaRotation(1) * h3d_fHUDInertFactor;
    m_aH3DSway /= 2;
    
    if (m_ulFlags&PLF_ISZOOMING) {
      FLOAT fRotationDamping = ((CPlayerWeapons &)*m_penWeapons).m_fSniperFOV/((CPlayerWeapons &)*m_penWeapons).m_fSniperMaxFOV;
      aDeltaRotation *= fRotationDamping;
      aDeltaViewRotation *= fRotationDamping;
    }
    //FLOAT3D vDeltaTranslation  = paAction.pa_vTranslation -m_vLastTranslation;
    m_aLastRotation     = paAction.pa_aRotation;
    m_aLastViewRotation = paAction.pa_aViewRotation;
    //m_vLastTranslation  = paAction.pa_vTranslation;
    paAction.pa_aRotation     = aDeltaRotation;
    paAction.pa_aViewRotation = aDeltaViewRotation;
    //paAction.pa_vTranslation  = vDeltaTranslation;

    // adjust rotations per tick
    paAction.pa_aRotation /= _pTimer->TickQuantum;
    paAction.pa_aViewRotation /= _pTimer->TickQuantum;

    // adjust prediction for remote players only
    CEntity *penMe = this;
    if (IsPredictor()) {
      penMe = penMe->GetPredicted();
    }
    SetPredictable(!_pNetwork->IsPlayerLocal(penMe));

    // check for end of game
    if (!IsPredictor()) {
      CheckGameEnd();
    }

    // limit speeds against abusing
    paAction.pa_vTranslation(1) = Clamp( paAction.pa_vTranslation(1), -plr_fSpeedSide,    plr_fSpeedSide);
    paAction.pa_vTranslation(2) = Clamp( paAction.pa_vTranslation(2), -plr_fSpeedUp,      plr_fSpeedUp);
    paAction.pa_vTranslation(3) = Clamp( paAction.pa_vTranslation(3), -plr_fSpeedForward, plr_fSpeedBackward);

    // if speeds are like walking
    if (Abs(paAction.pa_vTranslation(3))< plr_fSpeedForward/1.99f
      &&Abs(paAction.pa_vTranslation(1))< plr_fSpeedSide/1.99f) {
      // don't allow falling
      en_fStepDnHeight = 1.5f;

    // if speeds are like running
    } else {
      // allow falling
      en_fStepDnHeight = -1;
    }

    // limit diagonal speed against abusing
    FLOAT3D &v = paAction.pa_vTranslation;
    FLOAT fDiag = Sqrt(v(1)*v(1)+v(3)*v(3));
    if (fDiag>0.01f) {
      FLOAT fDiagLimited = Min(fDiag, plr_fSpeedForward);
      FLOAT fFactor = fDiagLimited/fDiag;
      v(1)*=fFactor;
      v(3)*=fFactor;
    }

    ulButtonsNow = paAction.pa_ulButtons;
    ulButtonsBefore = m_ulLastButtons;
    ulNewButtons = ulButtonsNow&~ulButtonsBefore;
    ulReleasedButtons = (~ulButtonsNow)&(ulButtonsBefore);

    m_ulLastButtons = ulButtonsNow;         // remember last buttons
    en_plLastViewpoint = en_plViewpoint;    // remember last view point for lerping

    // sniper zooming
    CPlayerWeapons *penWeapon = GetPlayerWeapons();
    if (penWeapon->m_iCurrentWeapon == WEAPON_SNIPER)
    {
      if (bUseButtonHeld && m_ulFlags&PLF_ISZOOMING)
      {
        penWeapon->m_fSniperFOVlast = penWeapon->m_fSniperFOV;
        penWeapon->m_fSniperFOV -= penWeapon->m_fSnipingZoomSpeed;
        if (penWeapon->m_fSniperFOV < penWeapon->m_fSniperMinFOV) 
        {
          penWeapon->m_fSniperFOVlast = penWeapon->m_fSniperFOV = penWeapon->m_fSniperMinFOV;
          PlaySound(m_soSniperZoom, SOUND_SILENCE, SOF_3D);
          if(_pNetwork->IsPlayerLocal(this)) {IFeel_StopEffect("SniperZoom");}
        }
      }
      if (ulReleasedButtons&PLACT_USE_HELD)
      {
         penWeapon->m_fSniperFOVlast = penWeapon->m_fSniperFOV;
         PlaySound(m_soSniperZoom, SOUND_SILENCE, SOF_3D);
         if(_pNetwork->IsPlayerLocal(this)) {IFeel_StopEffect("SniperZoom");}
      }
    }
    
    if (!GetSP()->sp_bSinglePlayer) {
      UpdateHUD();
      ApplyShakingFromDamage();
    }
    // if alive
    if (GetFlags() & ENF_ALIVE) {
      // if not in auto-action mode
      if (m_penActionMarker==NULL) {
        // apply actions
        AliveActions(paAction);
      // if in auto-action mode
      } else {
        // do automatic actions
        AutoActions(paAction);
      }
    // if not alive rotate camera view and rebirth on fire
    } else {
      DeathActions(paAction);
    }

    if (Abs(_pTimer->CurrentTick()-m_tmAnalyseEnd)<_pTimer->TickQuantum*2) {
      m_tmAnalyseEnd = 0;
      m_bPendingMessage = TRUE;
      m_tmMessagePlay = 0;
    }
    if (m_bPendingMessage && !IsFuss()) {
      m_bPendingMessage = FALSE;
      m_tmMessagePlay = _pTimer->CurrentTick()+1.0f;
      m_tmAnimateInbox = _pTimer->CurrentTick();
    }
    if (Abs(_pTimer->CurrentTick()-m_tmMessagePlay)<_pTimer->TickQuantum*2) {
      m_bPendingMessage = FALSE;
      m_tmAnalyseEnd = 0;

      if (!m_bComputerInvoked && GetSP()->sp_bSinglePlayer) {
        PrintCenterMessage(this, this, 
          TRANS("Press USE to read the message!"), 5.0f, MSS_NONE);
      }
    }

    // wanna cheat a bit?
    if (CheatsEnabled()) {
      Cheats();
    }

	if (dbg_strEnemySpawnerInfo==1 && _pNetwork->IsPlayerLocal(this)) {
	      // for each entity in the world
		{FOREACHINDYNAMICCONTAINER(GetWorld()->wo_cenEntities, CEntity, iten) {
		 CEntity *pen = iten;
      if (IsOfClass(pen, "Enemy Spawner")) {
        CEnemySpawner* penSpawner = ((CEnemySpawner*)&*pen);
        CPlacement3D plSpawner = penSpawner->GetPlacement();
        if (penSpawner->m_penTarget == NULL && penSpawner->m_penSeriousTarget == NULL) {
          CPrintF("^cff0000Enemy spawner: %s, X: %f, Y: %f, Z: %f \n^C", 
            penSpawner->GetName(), 
            plSpawner.pl_PositionVector(1),
            plSpawner.pl_PositionVector(2),
            plSpawner.pl_PositionVector(3));
          continue;
        }

        if (penSpawner->m_bFirstPass) {
          CPrintF("Enemy Spawner: %s, X: %f, Y: %f, Z: %f\n", 
            penSpawner->GetName(), 
            plSpawner.pl_PositionVector(1),
            plSpawner.pl_PositionVector(2),
            plSpawner.pl_PositionVector(3));
          continue;
        }
      }
    }}
		dbg_strEnemySpawnerInfo = 0;
	}

  if (dbg_strEnemyBaseInfo==1 && _pNetwork->IsPlayerLocal(this)) {
	      // for each entity in the world
		{FOREACHINDYNAMICCONTAINER(GetWorld()->wo_cenEntities, CEntity, iten) {
		 CEntity *pen = iten;
      if (IsDerivedFromClass(pen, "Enemy Base") && !IsOfClass(pen, "Devil")) {
        CEnemyBase *penEnemy = (CEnemyBase *)pen;
        CPlacement3D plEnemy = penEnemy->GetPlacement();
        if (penEnemy->m_bTemplate==FALSE) {
          CPrintF("Enemy base: %s, X: %f, Y: %f, Z: %f \n^C", 
            penEnemy->GetName(), 
            plEnemy.pl_PositionVector(1),
            plEnemy.pl_PositionVector(2),
            plEnemy.pl_PositionVector(3));
          continue;
        }
      }
    }}
		dbg_strEnemyBaseInfo = 0;
	}

    // if teleporting to marker (this cheat is enabled in all versions)
    if (cht_iGoToMarker>0 && (GetFlags()&ENF_ALIVE)) {
      // rebirth player, and it will teleport
      m_iLastViewState = m_iViewState;
      SendEvent(ERebirth());
    }

    // keep latency for eventual printout
    UpdateLatency(tmLatency);

    // check if highscore has changed
    CheckHighScore();
  };


  // Called when player is disconnected
  void Disconnect(void)
  {
    // remember name
    m_strName = GetPlayerName();
    // clear the character, so we don't get re-connected to same entity
    en_pcCharacter = CPlayerCharacter();
    // make main loop exit
    SendEvent(EDisconnected());
  };

  // Called when player character is changed
  void CharacterChanged(const CPlayerCharacter &pcNew) 
  {
    // remember original character
    CPlayerCharacter pcOrg = en_pcCharacter;

    // set the new character
    en_pcCharacter = pcNew;
    ValidateCharacter();

    // if the name has changed
    if (pcOrg.GetName()!=pcNew.GetName()) {
      // report that
      CPrintF(TRANS("%s is now known as %s\n"), 
        pcOrg.GetNameForPrinting(), pcNew.GetNameForPrinting());
    }

    // if the team has changed
    if (pcOrg.GetTeam()!=pcNew.GetTeam()) {
      // report that
      CPrintF(TRANS("%s switched to team %s\n"), 
        pcNew.GetNameForPrinting(), pcNew.GetTeamForPrinting());
    }

    // if appearance changed
    CPlayerSettings *ppsOrg = (CPlayerSettings *)pcOrg.pc_aubAppearance;
    CPlayerSettings *ppsNew = (CPlayerSettings *)pcNew.pc_aubAppearance;
    if (memcmp(ppsOrg->ps_achModelFile, ppsNew->ps_achModelFile, sizeof(ppsOrg->ps_achModelFile))!=0) {
      // update your real appearance if possible
      CTString strNewLook;
      BOOL bSuccess = SetPlayerAppearance(&m_moRender, &en_pcCharacter, strNewLook, /*bPreview=*/FALSE);
      // if succeeded
      if (bSuccess) {
        ParseGender(strNewLook);
        // report that
        CPrintF(TRANS("%s now appears as %s\n"), 
          pcNew.GetNameForPrinting(), strNewLook);
      // if failed
      } else {
        // report that
        CPrintF(TRANS("Cannot change appearance for %s: setting '%s' is unavailable\n"), 
          pcNew.GetNameForPrinting(), (const char*)ppsNew->GetModelFilename());
      }
      // attach weapon to new appearance
      GetPlayerAnimator()->SyncWeapon();
    }

    BOOL b3RDPersonOld = ppsOrg->ps_ulFlags&PSF_PREFER3RDPERSON;
    BOOL b3RDPersonNew = ppsNew->ps_ulFlags&PSF_PREFER3RDPERSON;
    if ((b3RDPersonOld && !b3RDPersonNew && m_iViewState==PVT_3RDPERSONVIEW)
      ||(b3RDPersonNew && !b3RDPersonOld && m_iViewState==PVT_PLAYEREYES) ) {
      ChangePlayerView();
    }
  };


  // Alive actions
  void AliveActions(const CPlayerAction &pa) 
  {
    CPlayerAction paAction = pa;

    // if camera is active
    if (m_penCamera!=NULL) {
      // ignore keyboard/mouse/joystick commands
      paAction.pa_vTranslation  = FLOAT3D(0,0,0);
      paAction.pa_aRotation     = ANGLE3D(0,0,0);
      paAction.pa_aViewRotation = ANGLE3D(0,0,0);


      if (m_penShop == NULL) {
        // default croteam code
        // if fire or use is pressed
        if (ulNewButtons&(PLACT_FIRE|PLACT_USE)) {
          // stop camera
          m_penCamera=NULL;
        }
      } else {
        //
        // SHOP INPUT
        //

        CShop* penShop = ((CShop*)&*m_penShop);

        if (ulNewButtons&(PLACT_FIRE)) {
          if (penShop->GetItemCost(m_iSelectedShopIndex) > m_iMoney) {
              PrintCenterMessage(this, this, TRANS("Not enough credits!"), 3.0f, MSS_INFO);
              PlaySound(m_soMouth, SOUND_SHOP_ERROR, SOF_3D);
          } else {
            BuyItem();
          }
        }

        if (ulNewButtons&(PLACT_USE)) {
           m_penCamera = NULL;
           m_penShop = NULL;
        }

        if (ulNewButtons&(PLACT_WEAPON_NEXT)) {
          do {
            m_iSelectedShopIndex++;
            if (m_iSelectedShopIndex>5) {
              m_iSelectedShopIndex=0;
            }
          } while (penShop->GetItemType(m_iSelectedShopIndex) == 0);
        }


        if (ulNewButtons&(PLACT_WEAPON_PREV)) {
          do {
            m_iSelectedShopIndex--;
            if (m_iSelectedShopIndex<0) {
              m_iSelectedShopIndex=5;
            }
          } while (penShop->GetItemType(m_iSelectedShopIndex) == 0);
        }

      }
    } else {
      ButtonsActions(paAction);
    }

    if (m_tmLastDamage+m_fShieldDelay < _pTimer->CurrentTick()) { //h3d Shield sound regen
      if (m_bShieldCharging == FALSE && m_fShield<m_fMaxShield) {
        SetRandomShieldPitch( 0.9f, 1.1f);
        PlaySound(m_soShield, SOUND_SHIELD_CHARGE, SOF_3D);
        m_bShieldCharging = TRUE;
      } else if (m_fShield==m_fMaxShield && m_bShieldCharging==TRUE) {
        SetRandomShieldPitch( 0.9f, 1.1f);
        PlaySound(m_soShield, SOUND_SHIELD_CHARGED, SOF_3D);
        m_bShieldCharging = FALSE;
      }
    } else {
      m_bShieldCharging = FALSE;
    }

    // do the actions
    ActiveActions(paAction);

    // if less than few seconds elapsed since last damage
    FLOAT tmSinceWounding = _pTimer->CurrentTick() - m_tmWoundedTime;
    if( tmSinceWounding<4.0f) {
      // decrease damage ammount
      m_fDamageAmmount *= 1.0f - tmSinceWounding/4.0f;
    } else {
      // reset damage ammount
      m_fDamageAmmount = 0.0f;
    }

    // * H3D SHIELD ***************************************************************
  	// if less than few seconds elapsed since last damage
    FLOAT tmSinceShieldWounding = _pTimer->CurrentTick() - m_tmShieldWoundTime;
    if( tmSinceShieldWounding<4.0f) {
      // decrease damage ammount
      m_fShieldDamageAmmount *= 1.0f - tmSinceShieldWounding/4.0f;
    } else {
      // reset damage ammount
      m_fShieldDamageAmmount = 0.0f;
    }
  	// ****************************************************************************

    // * H3D SHIELD ***************************************************************
	  // if less than few seconds elapsed since last damage
    FLOAT tmSinceShieldBroken = _pTimer->CurrentTick() - m_tmShieldBroken;
    if( tmSinceShieldBroken<1.0f) {
      // decrease damage ammount
      m_fShieldBrokenAmmount *= 1.0f - tmSinceShieldWounding/4.0f;
    } else {
      // reset damage ammount
      m_fShieldBrokenAmmount = 0.0f;
    }
  	// ****************************************************************************

  }

  // Auto-actions
  void AutoActions(const CPlayerAction &pa) 
  {
    // if fire, use or computer is pressed
    if (ulNewButtons&(PLACT_FIRE|PLACT_USE|PLACT_COMPUTER)) {
      if (m_penCamera!=NULL) {
        CEntity *penOnBreak = ((CCamera&)*m_penCamera).m_penOnBreak;
        if (penOnBreak!=NULL) {
          SendToTarget(penOnBreak, EET_TRIGGER, this);
        }
      }
    }

    CPlayerAction paAction = pa;
    // ignore keyboard/mouse/joystick commands
    paAction.pa_vTranslation  = FLOAT3D(0,0,0);
    paAction.pa_aRotation     = ANGLE3D(0,0,0);
    paAction.pa_aViewRotation = ANGLE3D(0,0,0);

    // if moving towards the marker is enabled
    if (m_fAutoSpeed>0) {
      FLOAT3D vDelta = 
        m_penActionMarker->GetPlacement().pl_PositionVector-
        GetPlacement().pl_PositionVector;
      FLOAT fDistance = vDelta.Length();
      if (fDistance>0.1f) {
        vDelta/=fDistance;
        ANGLE aDH = GetRelativeHeading(vDelta);

        // if should hit the marker exactly
        FLOAT fSpeed = m_fAutoSpeed;
        if (GetActionMarker()->m_paaAction==PAA_RUNANDSTOP) {
          // adjust speed
          fSpeed = Min(fSpeed, fDistance/_pTimer->TickQuantum);
        }
        // adjust rotation
        if (Abs(aDH)>5.0f) {
          if (fSpeed>m_fAutoSpeed-0.1f) {
            aDH = Clamp(aDH, -30.0f, 30.0f);
          }
          paAction.pa_aRotation = ANGLE3D(aDH/_pTimer->TickQuantum,0,0);
        }
        // set forward speed
        paAction.pa_vTranslation = FLOAT3D(0,0,-fSpeed);
      }
    } else {
      paAction.pa_vTranslation = m_vAutoSpeed;
    }

    CPlayerActionMarker *ppam = GetActionMarker();
    ASSERT( ppam != NULL);
    if( ppam->m_paaAction == PAA_LOGO_FIRE_MINIGUN || ppam->m_paaAction == PAA_LOGO_FIRE_INTROSE)
    {
      if( m_tmMinigunAutoFireStart != -1)
      {
        FLOAT tmDelta = _pTimer->CurrentTick()-m_tmMinigunAutoFireStart;
        FLOAT aDH=0.0f;
        FLOAT aDP=0.0f;
        if( tmDelta>=0.0f && tmDelta<=0.75f)
        {
          aDH = 0.0f;
        }
        else if( tmDelta>=0.75f)
        {
          FLOAT fDT = tmDelta-0.75f;
          aDH = 1.0f*cos(fDT+PI/2.0f);
          aDP = 0.5f*cos(fDT);
        }
        if(ppam->m_paaAction == PAA_LOGO_FIRE_INTROSE)
        {
          FLOAT fRatio=CalculateRatio(tmDelta,0.25,5,0.1f,0.1f);
          aDP=2.0f*sin(tmDelta*200.0f)*fRatio;
          if(tmDelta>2.5f)
          {
            aDP+=(tmDelta-2.5f)*4.0f;
          }
        }
        paAction.pa_aRotation = ANGLE3D(aDH/_pTimer->TickQuantum, aDP/_pTimer->TickQuantum,0);
      }
    }

    // do the actions
    if (!(m_ulFlags&PLF_AUTOMOVEMENTS)) {
      ActiveActions(paAction);
    }
  }

  void GetLerpedWeaponPosition( FLOAT3D vRel, CPlacement3D &pl)
  {
    pl = CPlacement3D( vRel, ANGLE3D(0,0,0));
    CPlacement3D plView;
    _bDiscard3rdView=GetViewEntity()!=this;
    GetLerpedAbsoluteViewPlacement(plView);
    pl.RelativeToAbsolute( plView);
  }

  void SpawnBubbles( INDEX ctBubbles)
  {
    for( INDEX iBouble=0; iBouble<ctBubbles; iBouble++)
    {
      FLOAT3D vRndRel = FLOAT3D( (FRnd()-0.5f)*0.25f, -0.25f, -0.5f+FRnd()/10.0f);
      ANGLE3D aDummy = ANGLE3D(0,0,0);
      CPlacement3D plMouth = CPlacement3D( vRndRel, aDummy);

      plMouth.RelativeToAbsolute( en_plViewpoint);
      plMouth.RelativeToAbsolute( GetPlacement());
      FLOAT3D vRndSpd = FLOAT3D( (FRnd()-0.5f)*0.25f, (FRnd()-0.5f)*0.25f, (FRnd()-0.5f)*0.25f);
      AddBouble( plMouth.pl_PositionVector, vRndSpd);
    }
  }

  void PlayPowerUpSound ( void ) {
    m_soPowerUpBeep.Set3DParameters(50.0f, 10.0f, 4.0f, 1.0f);
    PlaySound(m_soPowerUpBeep, SOUND_POWERUP_BEEP, SOF_3D|SOF_VOLUMETRIC|SOF_LOCAL);
  }

  void ActiveActions(const CPlayerAction &paAction)
  {
    // translation
    FLOAT3D vTranslation = paAction.pa_vTranslation;
    // turbo speed cheat
    if (cht_fTranslationMultiplier && CheatsEnabled()) { 
      vTranslation *= cht_fTranslationMultiplier;
    }

    // enable faster moving if holding knife in DM
    if( ((CPlayerWeapons&)*m_penWeapons).m_iCurrentWeapon==WEAPON_KNIFE &&
         !GetSP()->sp_bCooperative) {
      vTranslation *= 1.3f;
    }

    // enable faster moving (but not higher jumping!) if having SerousSpeed powerup
    const TIME tmDelta = m_tmSeriousSpeed - _pTimer->CurrentTick();
    if( tmDelta>0 && m_fAutoSpeed==0.0f) { 
      vTranslation(1) *= 2.0f;
      vTranslation(3) *= 2.0f;
    }
    
    en_fAcceleration = plr_fAcceleration;
    en_fDeceleration = plr_fDeceleration;
    if( !GetSP()->sp_bCooperative)
    {
      vTranslation(1) *= 1.35f;
      vTranslation(3) *= 1.35f;
    //en_fDeceleration *= 0.8f;
    }

    CContentType &ctUp = GetWorld()->wo_actContentTypes[en_iUpContent];
    CContentType &ctDn = GetWorld()->wo_actContentTypes[en_iDnContent];
    PlayerState pstWanted = PST_STAND;
    BOOL bUpSwimable = (ctUp.ct_ulFlags&CTF_SWIMABLE) && en_fImmersionFactor<=0.99f;
    BOOL bDnSwimable = (ctDn.ct_ulFlags&CTF_SWIMABLE) && en_fImmersionFactor>=0.5f;

    // if considerably inside swimable content
    if (bUpSwimable || bDnSwimable) {
      // allow jumping
      m_ulFlags|=PLF_JUMPALLOWED;
      //CPrintF("swimable %f", en_fImmersionFactor);
      // if totaly inside
      if (en_fImmersionFactor>=0.99f || bUpSwimable) {
        // want to dive
        pstWanted = PST_DIVE;
      // if only partially inside
      } else {
        // want to swim
        pstWanted = PST_SWIM;
      }
    // if not in swimable content
    } else {
      // if has reference
      if (en_penReference!=NULL) {
        // reset fall timer
        m_fFallTime = 0.0f;

      // if no reference
      } else {
        // increase fall time
        m_fFallTime += _pTimer->TickQuantum;
      }
      // if not wanting to jump
      if (vTranslation(2)<0.1f) {
        // allow jumping
        m_ulFlags|=PLF_JUMPALLOWED;
      }

      // if falling
      if (m_fFallTime >= 0.5f) {
        // wants to fall
        pstWanted = PST_FALL;
      // if not falling
      } else {
        // if holding down and really not in air
        if (vTranslation(2)<-0.01f/* && m_fFallTime<0.5f*/) {
          // wants to crouch
          pstWanted = PST_CROUCH;
        // if not holding down
        } else {
          // wants to stand
          pstWanted = PST_STAND;
        }
      }
    }
    //CPrintF("c - %s w - %s", NameForState(m_pstState), NameForState(pstWanted));

    // flying mode - rotate whole player
    if (!(GetPhysicsFlags()&EPF_TRANSLATEDBYGRAVITY)) {
      SetDesiredRotation(paAction.pa_aRotation);
      StartModelAnim(PLAYER_ANIM_STAND, AOF_LOOPING|AOF_NORESTART);
      SetDesiredTranslation(vTranslation);
    // normal mode
    } else {
      PlayerState pstOld = m_pstState; 

      // if different state needed
      if (pstWanted!=m_pstState) {
        // check state wanted
        switch(pstWanted) {
        // if wanting to stand
        case PST_STAND: {
          // if can stand here
          if (ChangeCollisionBoxIndexNow(PLAYER_COLLISION_BOX_STAND)) {
            en_plViewpoint.pl_PositionVector(2) = plr_fViewHeightStand;
            if (m_pstState==PST_CROUCH) {
              ((CPlayerAnimator&)*m_penAnimator).Rise();
            } else {
              ((CPlayerAnimator&)*m_penAnimator).Stand();
            }
            m_pstState = PST_STAND;
          }
                        } break;
        // if wanting to crouch
        case PST_CROUCH: {
          // if can crouch here
          if (ChangeCollisionBoxIndexNow(PLAYER_COLLISION_BOX_CROUCH)) {
            m_pstState = PST_CROUCH;
            en_plViewpoint.pl_PositionVector(2) = plr_fViewHeightCrouch;
            ((CPlayerAnimator&)*m_penAnimator).Crouch();
          }
                        } break;
        // if wanting to swim
        case PST_SWIM: {
          // if can swim here
          if (ChangeCollisionBoxIndexNow(PLAYER_COLLISION_BOX_SWIMSMALL)) {
            ChangeCollisionBoxIndexWhenPossible(PLAYER_COLLISION_BOX_SWIM);
            m_pstState = PST_SWIM;
            en_plViewpoint.pl_PositionVector(2) = plr_fViewHeightSwim;
            ((CPlayerAnimator&)*m_penAnimator).Swim();                   
            m_fSwimTime = _pTimer->CurrentTick();
          }
                        } break;
        // if wanting to dive
        case PST_DIVE: {
          // if can dive here
          if (ChangeCollisionBoxIndexNow(PLAYER_COLLISION_BOX_SWIMSMALL)) {
            ChangeCollisionBoxIndexWhenPossible(PLAYER_COLLISION_BOX_SWIM);
            m_pstState = PST_DIVE;
            en_plViewpoint.pl_PositionVector(2) = plr_fViewHeightDive;
            ((CPlayerAnimator&)*m_penAnimator).Swim();
          }
                        } break;
        // if wanting to fall
        case PST_FALL: {
          // if can fall here
          if (ChangeCollisionBoxIndexNow(PLAYER_COLLISION_BOX_STAND)) {
            m_pstState = PST_FALL;
            en_plViewpoint.pl_PositionVector(2) = plr_fViewHeightStand;
            ((CPlayerAnimator&)*m_penAnimator).Fall();
          }
                        } break;
        }
      }

      // if state changed
      if (m_pstState!=pstOld) {
        // check water entering/leaving
        BOOL bWasInWater = (pstOld==PST_SWIM||pstOld==PST_DIVE);
        BOOL bIsInWater = (m_pstState==PST_SWIM||m_pstState==PST_DIVE);
        // if entered water
        if (bIsInWater && !bWasInWater) {
          PlaySound(m_soBody, GenderSound(SOUND_WATER_ENTER), SOF_3D);
        // if left water
        } else if (!bIsInWater && bWasInWater) {
          PlaySound(m_soBody, GenderSound(SOUND_WATER_LEAVE), SOF_3D);
          m_tmOutOfWater = _pTimer->CurrentTick();
          //CPrintF("gotout ");
        // if in water
        } else if (bIsInWater) {
          // if dived in
          if (pstOld==PST_SWIM && m_pstState == PST_DIVE) {
            PlaySound(m_soFootL, GenderSound(SOUND_DIVEIN), SOF_3D);
            if(_pNetwork->IsPlayerLocal(this)) {IFeel_PlayEffect("DiveIn");}
            m_bMoveSoundLeft = TRUE;
            m_tmMoveSound = _pTimer->CurrentTick();
          // if dived out
          } else if (m_pstState==PST_SWIM && pstOld==PST_DIVE) {
            PlaySound(m_soFootL, GenderSound(SOUND_DIVEOUT), SOF_3D);
            m_bMoveSoundLeft = TRUE;
            m_tmMoveSound = _pTimer->CurrentTick();
          }
        }
        // if just fell to ground
        if (pstOld==PST_FALL && (m_pstState==PST_STAND||m_pstState==PST_CROUCH)) {
          PlaySound(m_soFootL, GenderSound(SOUND_LAND), SOF_3D);
          if(_pNetwork->IsPlayerLocal(this)) {IFeel_PlayEffect("Land");}
        }
        // change ambience sounds
        if (m_pstState==PST_DIVE) {
          m_soLocalAmbientLoop.Set3DParameters(50.0f, 10.0f, 0.25f, 1.0f);
          PlaySound(m_soLocalAmbientLoop, SOUND_WATERAMBIENT, 
            SOF_LOOP|SOF_3D|SOF_VOLUMETRIC|SOF_LOCAL);
        } else if (pstOld==PST_DIVE) {
          m_soLocalAmbientLoop.Stop();
        }
      }
      // if just jumped
      if (en_tmJumped+_pTimer->TickQuantum>=_pTimer->CurrentTick() &&
          en_tmJumped<=_pTimer->CurrentTick() && en_penReference==NULL) {
        // play jump sound
        SetDefaultMouthPitch();
        PlaySound(m_soMouth, GenderSound(SOUND_JUMP), SOF_3D);
        if(_pNetwork->IsPlayerLocal(this)) {IFeel_PlayEffect("Jump");}
        // disallow jumping
        m_ulFlags&=~PLF_JUMPALLOWED;
      }

      // set density
      if (m_pstState == PST_SWIM || pstWanted == PST_SWIM
        ||(pstWanted == PST_DIVE && m_pstState != pstWanted)) {
        en_fDensity = 500.0f;  // lower density than water
      } else {
        en_fDensity = 1000.0f; // same density as water
      }

      if (_pTimer->CurrentTick()>=m_tmNextAmbientOnce)
      {
        if (m_pstState == PST_DIVE)
        {
          PlaySound(m_soLocalAmbientOnce, SOUND_WATERBUBBLES, 
            SOF_3D|SOF_VOLUMETRIC|SOF_LOCAL);
          m_soLocalAmbientOnce.Set3DParameters(25.0f, 5.0f, 2.0f, Lerp(0.5f, 1.5f, FRnd()) );
          SpawnBubbles( 5+INDEX(FRnd()*5));
        }
        m_tmNextAmbientOnce = _pTimer->CurrentTick()+5.0f+FRnd();
      }


      // if crouching
      if (m_pstState == PST_CROUCH) {
        // go slower
        vTranslation /= 2.5f;
        // don't go down
        vTranslation(2) = 0.0f;
      }

      // if diving
      if (m_pstState == PST_DIVE) {
        // translate up/down with view pitch
        FLOATmatrix3D mPitch;
        MakeRotationMatrixFast(mPitch, FLOAT3D(0,en_plViewpoint.pl_OrientationAngle(2),0));
        FLOAT fZ = vTranslation(3);
        vTranslation(3) = 0.0f;
        vTranslation += FLOAT3D(0,0,fZ)*mPitch;
      // if swimming
      } else if (m_pstState == PST_SWIM) {
        // translate down with view pitch if large
        FLOATmatrix3D mPitch;
        FLOAT fPitch = en_plViewpoint.pl_OrientationAngle(2);
        if (fPitch>-30.0f) {
          fPitch = 0;
        }
        MakeRotationMatrixFast(mPitch, FLOAT3D(0,fPitch,0));
        FLOAT fZ = vTranslation(3);
        vTranslation(3) = 0.0f;
        vTranslation += FLOAT3D(0,0,fZ)*mPitch;
      }

      // if swimming or diving
      if (m_pstState == PST_SWIM || m_pstState == PST_DIVE) {
        // up/down is slower than on ground
        vTranslation(2)*=0.5f;
      }

      // if just started swimming
      if (m_pstState == PST_SWIM && _pTimer->CurrentTick()<m_fSwimTime+0.5f
        ||_pTimer->CurrentTick()<m_tmOutOfWater+0.5f) {
        // no up/down change
        vTranslation(2)=0;
        //CPrintF(" noup");
      }

      //CPrintF("\n");

      // disable consecutive jumps
      if (!(m_ulFlags&PLF_JUMPALLOWED) && vTranslation(2)>0) {
        vTranslation(2) = 0.0f;
      }

      // set translation
      SetDesiredTranslation(vTranslation);

      // set pitch and banking from the normal rotation into the view rotation
      en_plViewpoint.Rotate_HPB(ANGLE3D(
        (ANGLE)((FLOAT)paAction.pa_aRotation(1)*_pTimer->TickQuantum),
        (ANGLE)((FLOAT)paAction.pa_aRotation(2)*_pTimer->TickQuantum),
        (ANGLE)((FLOAT)paAction.pa_aRotation(3)*_pTimer->TickQuantum)));
      // pitch and banking boundaries
      RoundViewAngle(en_plViewpoint.pl_OrientationAngle(2), PITCH_MAX);
      RoundViewAngle(en_plViewpoint.pl_OrientationAngle(3), BANKING_MAX);

      // translation rotate player for heading
      if (vTranslation.Length() > 0.1f) {
        SetDesiredRotation(ANGLE3D(en_plViewpoint.pl_OrientationAngle(1)/_pTimer->TickQuantum, 0.0f, 0.0f));
        if (m_ulFlags&PLF_VIEWROTATIONCHANGED) {
          m_ulFlags&=~PLF_VIEWROTATIONCHANGED;
          FLOATmatrix3D mViewRot;
          MakeRotationMatrixFast(mViewRot, ANGLE3D(en_plViewpoint.pl_OrientationAngle(1),0,0));
          FLOAT3D vTransRel = vTranslation*mViewRot;
          SetDesiredTranslation(vTransRel);
        }
        en_plViewpoint.pl_OrientationAngle(1) = 0.0f;

      // rotate head, body and legs
      } else {
        m_ulFlags |= PLF_VIEWROTATIONCHANGED;
        SetDesiredRotation(ANGLE3D(0.0f, 0.0f, 0.0f));
        ANGLE aDiff = en_plViewpoint.pl_OrientationAngle(1) - HEADING_MAX;
        if (aDiff > 0.0f) {
          SetDesiredRotation(ANGLE3D(aDiff/_pTimer->TickQuantum, 0.0f, 0.0f));
        }
        aDiff = en_plViewpoint.pl_OrientationAngle(1) + HEADING_MAX;
        if (aDiff < 0.0f) {
          SetDesiredRotation(ANGLE3D(aDiff/_pTimer->TickQuantum, 0.0f, 0.0f));
        }
        RoundViewAngle(en_plViewpoint.pl_OrientationAngle(1), HEADING_MAX);
      }

      // play moving sounds
      FLOAT fWantSpeed = en_vDesiredTranslationRelative.Length();
      FLOAT fGoesSpeed = en_vCurrentTranslationAbsolute.Length();
      BOOL bOnGround = (m_pstState == PST_STAND)||(m_pstState == PST_CROUCH);
      BOOL bRunning = bOnGround && fWantSpeed>5.0f && fGoesSpeed>5.0f;
      BOOL bWalking = bOnGround && !bRunning && fWantSpeed>2.0f && fGoesSpeed>2.0f;
      m_bWalking = bWalking;
      BOOL bSwimming = (m_pstState == PST_SWIM) && fWantSpeed>2.0f && fGoesSpeed>2.0f;
      BOOL bDiving = (m_pstState == PST_DIVE) && fWantSpeed>2.0f && fGoesSpeed>2.0f;
      TIME tmNow = _pTimer->CurrentTick();
      INDEX iSoundWalkL = SOUND_WALK_L;
      INDEX iSoundWalkR = SOUND_WALK_R;
      if ((ctDn.ct_ulFlags&CTF_SWIMABLE) && en_fImmersionFactor>=0.1f) {
        iSoundWalkL = SOUND_WATERWALK_L;
        iSoundWalkR = SOUND_WATERWALK_R;
      } else if (en_pbpoStandOn!=NULL && 
        en_pbpoStandOn->bpo_bppProperties.bpp_ubSurfaceType==SURFACE_SAND) {
        iSoundWalkL = SOUND_WALK_SAND_L;
        iSoundWalkR = SOUND_WALK_SAND_R;
      } else if (en_pbpoStandOn!=NULL && 
        en_pbpoStandOn->bpo_bppProperties.bpp_ubSurfaceType==SURFACE_RED_SAND) {
        iSoundWalkL = SOUND_WALK_SAND_L;
        iSoundWalkR = SOUND_WALK_SAND_R;
      } else if (en_pbpoStandOn!=NULL && 
        (en_pbpoStandOn->bpo_bppProperties.bpp_ubSurfaceType==SURFACE_GRASS ||
         en_pbpoStandOn->bpo_bppProperties.bpp_ubSurfaceType==SURFACE_GRASS_SLIDING ||
         en_pbpoStandOn->bpo_bppProperties.bpp_ubSurfaceType==SURFACE_GRASS_NOIMPACT )) {
        iSoundWalkL = SOUND_WALK_GRASS_L;
        iSoundWalkR = SOUND_WALK_GRASS_R;
      } else if (en_pbpoStandOn!=NULL && 
        en_pbpoStandOn->bpo_bppProperties.bpp_ubSurfaceType==SURFACE_WOOD) {
        iSoundWalkL = SOUND_WALK_WOOD_L;
        iSoundWalkR = SOUND_WALK_WOOD_R;
      } else if (en_pbpoStandOn!=NULL && 
        en_pbpoStandOn->bpo_bppProperties.bpp_ubSurfaceType==SURFACE_SNOW) {
        iSoundWalkL = SOUND_WALK_SNOW_L;
        iSoundWalkR = SOUND_WALK_SNOW_R;
      }
      else {
      }
      iSoundWalkL+=m_iGender*GENDEROFFSET;
      iSoundWalkR+=m_iGender*GENDEROFFSET;
      if (bRunning) {
        if (tmNow>m_tmMoveSound+plr_fRunSoundDelay) {
          m_tmMoveSound = tmNow;
          m_bMoveSoundLeft = !m_bMoveSoundLeft;
          if (m_bMoveSoundLeft) {
            PlaySound(m_soFootL, iSoundWalkL, SOF_3D);
          } else {
            PlaySound(m_soFootR, iSoundWalkR, SOF_3D);
          }
        }
      } else if (bWalking) {
        if (tmNow>m_tmMoveSound+plr_fWalkSoundDelay) {
          m_tmMoveSound = tmNow;
          m_bMoveSoundLeft = !m_bMoveSoundLeft;
          if (m_bMoveSoundLeft) {
            PlaySound(m_soFootL, iSoundWalkL, SOF_3D);
          } else {
            PlaySound(m_soFootR, iSoundWalkR, SOF_3D);
          }
        }
      } else if (bDiving) {
        if (tmNow>m_tmMoveSound+plr_fDiveSoundDelay) {
          m_tmMoveSound = tmNow;
          m_bMoveSoundLeft = !m_bMoveSoundLeft;
          if (m_bMoveSoundLeft) {
            PlaySound(m_soFootL, GenderSound(SOUND_DIVE_L), SOF_3D);
          } else {
            PlaySound(m_soFootR, GenderSound(SOUND_DIVE_R), SOF_3D);
          }
        }
      } else if (bSwimming) {
        if (tmNow>m_tmMoveSound+plr_fSwimSoundDelay) {
          m_tmMoveSound = tmNow;
          m_bMoveSoundLeft = !m_bMoveSoundLeft;
          if (m_bMoveSoundLeft) {
            PlaySound(m_soFootL, GenderSound(SOUND_SWIM_L), SOF_3D);
          } else {
            PlaySound(m_soFootR, GenderSound(SOUND_SWIM_R), SOF_3D);
          }
        }
      }
    
      // if player is almost out of air
      TIME tmBreathDelay = tmNow-en_tmLastBreathed;
      if (en_tmMaxHoldBreath-tmBreathDelay<20.0f) {
        // play drowning sound once in a while
        if (m_tmMouthSoundLast+2.0f<tmNow) {
          m_tmMouthSoundLast = tmNow;
          SetRandomMouthPitch(0.9f, 1.1f);
          PlaySound(m_soMouth, GenderSound(SOUND_DROWN), SOF_3D);
        }
      }

      // animate player
      ((CPlayerAnimator&)*m_penAnimator).AnimatePlayer();
    }
  };

  // Round view angle
  void RoundViewAngle(ANGLE &aViewAngle, ANGLE aRound) {
    if (aViewAngle > aRound) {
      aViewAngle = aRound;
    }
    if (aViewAngle < -aRound) {
      aViewAngle = -aRound;
    }
  };

  // Death actions
  void DeathActions(const CPlayerAction &paAction) {
    // set heading, pitch and banking from the normal rotation into the camera view rotation
    if (m_penView!=NULL) {
      ASSERT(IsPredicted()&&m_penView->IsPredicted()||IsPredictor()&&m_penView->IsPredictor()||!IsPredicted()&&!m_penView->IsPredicted()&&!IsPredictor()&&!m_penView->IsPredictor());
      en_plViewpoint.pl_PositionVector = FLOAT3D(0, 1, 0);
      en_plViewpoint.pl_OrientationAngle += (ANGLE3D(
        (ANGLE)((FLOAT)paAction.pa_aRotation(1)*_pTimer->TickQuantum),
        (ANGLE)((FLOAT)paAction.pa_aRotation(2)*_pTimer->TickQuantum),
        (ANGLE)((FLOAT)paAction.pa_aRotation(3)*_pTimer->TickQuantum)));
    }

	m_bShowingTabInfo = FALSE;
    if (ulButtonsNow&PLACT_SHOW_TAB_INFO) {
      m_bShowingTabInfo = TRUE;
    }
	// if death is finished and fire just released again and this is not a predictor
    if (m_iMayRespawn==2 && (ulReleasedButtons&PLACT_FIRE) && !IsPredictor()) {
      // if singleplayer
      if( GetSP()->sp_bSinglePlayer) {
        // load quick savegame
        _pShell->Execute("gam_bQuickLoad=1;");
		
      // if deathmatch or similar
      } else if( !GetSP()->sp_bCooperative) {
        // rebirth
        SendEvent(EEnd());
      // if cooperative
      } else {
        // if holding down reload button
        if (m_ulLastButtons&PLACT_RELOAD) {
          // forbid respawning in-place
          m_ulFlags &= ~PLF_RESPAWNINPLACE;
        }
		CoopRespawn();
	  }
    }
    // check fire released once after death
    if (m_iMayRespawn==1 && !(ulButtonsNow&PLACT_FIRE)) {
      m_iMayRespawn=2;
    }
  };


  // Buttons actions
  void ButtonsActions( CPlayerAction &paAction)
  {
    // if selecting a new weapon select it
    if((ulNewButtons&PLACT_SELECT_WEAPON_MASK)!=0) {
      ESelectWeapon eSelect;
      eSelect.iWeapon = (ulNewButtons&PLACT_SELECT_WEAPON_MASK)>>PLACT_SELECT_WEAPON_SHIFT;
      ((CPlayerWeapons&)*m_penWeapons).SendEvent(eSelect);
    }

    // next weapon zooms out when in sniping mode
    if(ulNewButtons&PLACT_WEAPON_NEXT) {
      if(((CPlayerWeapons&)*m_penWeapons).m_bSniping) {
        ApplySniperZoom(0);
      } else if (TRUE) {
        ESelectWeapon eSelect;
        eSelect.iWeapon = -1;
        ((CPlayerWeapons&)*m_penWeapons).SendEvent(eSelect);
      }
    }
    
    // previous weapon zooms in when in sniping mode
    if(ulNewButtons&PLACT_WEAPON_PREV) {
      if(((CPlayerWeapons&)*m_penWeapons).m_bSniping) {
        ApplySniperZoom(1);
      } else if (TRUE) {
        ESelectWeapon eSelect;
        eSelect.iWeapon = -2;
        ((CPlayerWeapons&)*m_penWeapons).SendEvent(eSelect);
      }
    }
    if(ulNewButtons&PLACT_WEAPON_FLIP) {
      ESelectWeapon eSelect;
      eSelect.iWeapon = -3;
      ((CPlayerWeapons&)*m_penWeapons).SendEvent(eSelect);
    }

    // if fire is pressed
    if (ulNewButtons&PLACT_FIRE) {
      ((CPlayerWeapons&)*m_penWeapons).SendEvent(EFireWeapon());
    }
    // if fire is released
    if (ulReleasedButtons&PLACT_FIRE) {
      ((CPlayerWeapons&)*m_penWeapons).SendEvent(EReleaseWeapon());
    }
    // if reload is pressed
    if (ulReleasedButtons&PLACT_RELOAD) {

      ((CPlayerWeapons&)*m_penWeapons).SendEvent(EReloadWeapon());
    }
    // if fire bomb is pressed
    if (ulNewButtons&PLACT_FIREBOMB) {
      if (m_iSeriousBombCount>0 && m_tmSeriousBombFired+4.0f<_pTimer->CurrentTick()) {
        m_iLastSeriousBombCount = m_iSeriousBombCount;
        m_iSeriousBombCount--;
        m_tmSeriousBombFired = _pTimer->CurrentTick();
        
        ESeriousBomb esb;
        esb.penOwner = this;
        CEntityPointer penBomb = CreateEntity(GetPlacement(), CLASS_SERIOUSBOMB);
        penBomb->Initialize(esb);
      }
    }

    m_bShowingTabInfo = FALSE;
    if (ulButtonsNow&PLACT_SHOW_TAB_INFO) {
      m_bShowingTabInfo = TRUE;
    }

	if (ulNewButtons&PLACT_DROP_MONEY) {
      DropMoney();
    }

    // if use is pressed
    if (ulNewButtons&PLACT_USE) {
        if (((CPlayerWeapons&)*m_penWeapons).m_iCurrentWeapon==WEAPON_SNIPER) {
          UsePressed(FALSE);
        } else {
          UsePressed(ulNewButtons&PLACT_COMPUTER);
        }
    // if USE is not detected due to doubleclick and player is holding sniper
    } else if (ulNewButtons&PLACT_SNIPER_USE && ((CPlayerWeapons&)*m_penWeapons).m_iCurrentWeapon==WEAPON_SNIPER) {
      UsePressed(FALSE);
    // if computer is pressed
    } else if (ulNewButtons&PLACT_COMPUTER) {
      ComputerPressed();
    }
    
    // if use is being held
    if (ulNewButtons&PLACT_USE_HELD) {
      bUseButtonHeld = TRUE;
    }

    // if use is released
    if (ulReleasedButtons&PLACT_USE_HELD) {
      bUseButtonHeld = FALSE;  
    }

    // if sniper zoomin is pressed
    if (ulNewButtons&PLACT_SNIPER_ZOOMIN) {
      ApplySniperZoom(1);
    }

    // if sniper zoomout is pressed
    if (ulNewButtons&PLACT_SNIPER_ZOOMOUT) {
      ApplySniperZoom(0);
    }

    // if 3rd person view is pressed
    if (ulNewButtons&PLACT_3RD_PERSON_VIEW) {
      ChangePlayerView();
    }

    // apply center view
    if( ulButtonsNow&PLACT_CENTER_VIEW) {
      // center view with speed of 45 degrees per 1/20 seconds
      paAction.pa_aRotation(2) += Clamp( -en_plViewpoint.pl_OrientationAngle(2)/_pTimer->TickQuantum, -900.0f, +900.0f);
    }
  };

  void ApplySniperZoom( BOOL bZoomIn )
  {
    // do nothing if not holding sniper and if not in sniping mode
    if (((CPlayerWeapons&)*m_penWeapons).m_iCurrentWeapon!=WEAPON_SNIPER ||
      ((CPlayerWeapons&)*m_penWeapons).m_bSniping==FALSE) {
      return;
    }
    BOOL bZoomChanged;
    if (((CPlayerWeapons&)*m_penWeapons).SniperZoomDiscrete(bZoomIn, bZoomChanged)) {
      if (bZoomChanged) { 
        PlaySound(m_soSniperZoom, SOUND_SNIPER_QZOOM, SOF_3D); 
      }
      m_ulFlags|=PLF_ISZOOMING;
    }
    else
    {
      m_ulFlags&=~PLF_ISZOOMING;
      PlaySound(m_soSniperZoom, SOUND_SILENCE, SOF_3D);
      if(_pNetwork->IsPlayerLocal(this)) {IFeel_StopEffect("SniperZoom");}
    }
  }

  // check if cheats can be active
  BOOL CheatsEnabled(void)
  {
    return (GetSP()->sp_ctMaxPlayers==1||GetSP()->sp_bQuickTest) && m_penActionMarker==NULL && !_SE_DEMO;
  }

  // Cheats
  void Cheats(void)
  {
    BOOL bFlyOn = cht_bFly || cht_bGhost;
    // fly mode
    BOOL bIsFlying = !(GetPhysicsFlags() & EPF_TRANSLATEDBYGRAVITY);
    if (bFlyOn && !bIsFlying) {
      SetPhysicsFlags(GetPhysicsFlags() & ~(EPF_TRANSLATEDBYGRAVITY|EPF_ORIENTEDBYGRAVITY));
      en_plViewpoint.pl_OrientationAngle = ANGLE3D(0, 0, 0);
    } else if (!bFlyOn && bIsFlying) {
      SetPhysicsFlags(GetPhysicsFlags() | EPF_TRANSLATEDBYGRAVITY|EPF_ORIENTEDBYGRAVITY);
      en_plViewpoint.pl_OrientationAngle = ANGLE3D(0, 0, 0);
    }

    // ghost mode
    BOOL bIsGhost = !(GetCollisionFlags() & ((ECBI_BRUSH|ECBI_MODEL)<<ECB_TEST));
    if (cht_bGhost && !bIsGhost) {
      SetCollisionFlags(GetCollisionFlags() & ~((ECBI_BRUSH|ECBI_MODEL)<<ECB_TEST));
    } else if (!cht_bGhost && bIsGhost) {
      SetCollisionFlags(GetCollisionFlags() | ((ECBI_BRUSH|ECBI_MODEL)<<ECB_TEST));
    }

    // invisible mode
    const TIME tmDelta = m_tmInvisibility - _pTimer->CurrentTick();
    if (cht_bInvisible || tmDelta>0) {
      SetFlags(GetFlags() | ENF_INVISIBLE);
    } else {
      SetFlags(GetFlags() & ~ENF_INVISIBLE);
    }

    // cheat
    if (cht_bGiveAll) {
      cht_bGiveAll = FALSE;
      ((CPlayerWeapons&)*m_penWeapons).CheatGiveAll();
    }

    if (cht_bKillAll) {
      cht_bKillAll = FALSE;
      KillAllEnemies(this);
    }

    if (cht_bOpen) {
      cht_bOpen = FALSE;
      ((CPlayerWeapons&)*m_penWeapons).CheatOpen();
    }
    
    if (cht_bAllMessages) {
      cht_bAllMessages = FALSE;
      CheatAllMessages();
    }
    
    if (cht_bRefresh) {
      cht_bRefresh = FALSE;
      SetHealth(TopHealth());
    }
    if (cht_fMaxShield) {
      cht_fMaxShield;
      m_fMaxShield=cht_fMaxShield;
    }
  };


/************************************************************
 *                 END OF PLAYER ACTIONS                    *
 ************************************************************/


  // Get current placement that the player views from in absolute space.
  void GetLerpedAbsoluteViewPlacement(CPlacement3D &plView) {
    if (!(m_ulFlags&PLF_INITIALIZED)) {
      plView = GetPlacement();
      _bDiscard3rdView=FALSE;
      return;
    }

    BOOL bSharpTurning = 
      (GetSettings()->ps_ulFlags&PSF_SHARPTURNING) &&
      _pNetwork->IsPlayerLocal((CPlayer*)GetPredictionTail());

    // lerp player viewpoint a 
    FLOAT fLerpFactor = _pTimer->GetLerpFactor();
    plView.Lerp(en_plLastViewpoint, en_plViewpoint, fLerpFactor);

    // moving banking and soft eyes
    ((CPlayerAnimator&)*m_penAnimator).ChangeView(plView);
    // body and head attachment animation
    ((CPlayerAnimator&)*m_penAnimator).BodyAndHeadOrientation(plView);

    // return player eyes view
    if (m_iViewState == PVT_PLAYEREYES || _bDiscard3rdView) {
      CPlacement3D plPosLerped = GetLerpedPlacement();
      if (bSharpTurning) {
        // get your prediction tail
        CPlayer *pen = (CPlayer*)GetPredictionTail();
        // add local rotation
        if (m_ulFlags&PLF_ISZOOMING) {
          FLOAT fRotationDamping = ((CPlayerWeapons &)*m_penWeapons).m_fSniperFOV/((CPlayerWeapons &)*m_penWeapons).m_fSniperMaxFOV;
          plView.pl_OrientationAngle = pen->en_plViewpoint.pl_OrientationAngle + (pen->m_aLocalRotation-pen->m_aLastRotation)*fRotationDamping;
        } else {
          plView.pl_OrientationAngle = pen->en_plViewpoint.pl_OrientationAngle + (pen->m_aLocalRotation-pen->m_aLastRotation);
        }
        // make sure it doesn't go out of limits
        RoundViewAngle(plView.pl_OrientationAngle(2), PITCH_MAX);
        RoundViewAngle(plView.pl_OrientationAngle(3), BANKING_MAX);

        // compensate for rotations that happen to the player without his/hers will
        // (rotating brushes, weird gravities...)
        // (these need to be lerped)
        ANGLE3D aCurr = pen->GetPlacement().pl_OrientationAngle;
        ANGLE3D aLast = pen->en_plLastPlacement.pl_OrientationAngle;
        ANGLE3D aDesired = pen->en_aDesiredRotationRelative*_pTimer->TickQuantum;
        FLOATmatrix3D mCurr;      MakeRotationMatrixFast(mCurr, aCurr);
        FLOATmatrix3D mLast;      MakeRotationMatrixFast(mLast, aLast);
        FLOATmatrix3D mDesired;   MakeRotationMatrixFast(mDesired, aDesired);
        mDesired = en_mRotation*(mDesired*!en_mRotation);
        FLOATmatrix3D mForced = !mDesired*mCurr*!mLast; // = aCurr-aLast-aDesired;
        ANGLE3D aForced; DecomposeRotationMatrixNoSnap(aForced, mForced);
        if (aForced.MaxNorm()<1E-2) {
          aForced = ANGLE3D(0,0,0);
        }
        FLOATquat3D qForced; qForced.FromEuler(aForced);
        FLOATquat3D qZero;   qZero.FromEuler(ANGLE3D(0,0,0));
        FLOATquat3D qLerped = Slerp(fLerpFactor, qZero, qForced);
        FLOATmatrix3D m;
        qLerped.ToMatrix(m);
        m=m*mDesired*mLast;
        DecomposeRotationMatrixNoSnap(plPosLerped.pl_OrientationAngle, m);
      }
      plView.RelativeToAbsoluteSmooth(plPosLerped);
    // 3rd person view
    } else if (m_iViewState == PVT_3RDPERSONVIEW) {
      plView = m_pen3rdPersonView->GetLerpedPlacement();
    // camera view for player auto actions
    } else if (m_iViewState == PVT_PLAYERAUTOVIEW) {
      plView = m_penView->GetLerpedPlacement();
    // camera view for stored sequences
    } else {
      ASSERTALWAYS("Unknown player view");
    }
    _bDiscard3rdView=FALSE;
  };

  // Get current entity that the player views from.
  CEntity *GetViewEntity(void) {
    // player eyes
    if (m_iViewState == PVT_PLAYEREYES) {
      return this;
    // 3rd person view
    } else if (m_iViewState == PVT_3RDPERSONVIEW) {
      if (m_ulFlags&PLF_ISZOOMING) {
        return this;
      }
      if (((CPlayerView&)*m_pen3rdPersonView).m_fDistance>2.0f) {
        return m_pen3rdPersonView;
      } else {
        return this;
      }
    // camera
    } else if (m_iViewState == PVT_PLAYERAUTOVIEW) {
      if (((CPlayerView&)*m_penView).m_fDistance>2.0f) {
        return m_penView;
      } else {
        return this;
      }
    // invalid view
    } else {
      ASSERTALWAYS("Unknown player view");
      return NULL;
    }
  };

  void RenderChainsawParticles(BOOL bThird)
  {
    FLOAT fStretch=1.0f;
    if( bThird)
    {
      fStretch=0.4f;
    }
    // render chainsaw cutting brush particles
    FLOAT tmNow = _pTimer->GetLerpedCurrentTick();
    for( INDEX iSpray=0; iSpray<MAX_BULLET_SPRAYS; iSpray++)
    {
      BulletSprayLaunchData &bsld = m_absldData[iSpray];
      FLOAT fLife=1.25f;
      if( tmNow > (bsld.bsld_tmLaunch+fLife)) { continue;}
      Particles_BulletSpray(bsld.bsld_iRndBase, bsld.bsld_vPos, bsld.bsld_vG,
        bsld.bsld_eptType, bsld.bsld_tmLaunch, bsld.bsld_vStretch*fStretch, 1.0f);
    }

    // render chainsaw cutting model particles
    for( INDEX iGore=0; iGore<MAX_GORE_SPRAYS; iGore++)
    {
      GoreSprayLaunchData &gsld = m_agsldData[iGore];
      FLOAT fLife=2.0f;
      if( tmNow > (gsld.gsld_tmLaunch+fLife)) { continue;}
      FLOAT3D vPos=gsld.gsld_vPos;
      if( bThird)
      {
        vPos=gsld.gsld_v3rdPos;
      }
      Particles_BloodSpray(gsld.gsld_sptType, vPos, gsld.gsld_vG, gsld.gsld_fGA,
        gsld.gsld_boxHitted, gsld.gsld_vSpilDirection,
        gsld.gsld_tmLaunch, gsld.gsld_fDamagePower*fStretch, gsld.gsld_colParticles);
    }
  }

  // Draw player interface on screen.
  void RenderHUD( CPerspectiveProjection3D &prProjection, CDrawPort *pdp,
                  FLOAT3D vViewerLightDirection, COLOR colViewerLight, COLOR colViewerAmbient,
                  BOOL bRenderWeapon, INDEX iEye)
  {
    CPlacement3D plViewOld = prProjection.ViewerPlacementR();
    BOOL bSniping = ((CPlayerWeapons&)*m_penWeapons).m_bSniping;
    // render weapon models if needed
    // do not render weapon if sniping
    BOOL bRenderModels = _pShell->GetINDEX("gfx_bRenderModels");
    if( hud_bShowWeapon && bRenderModels && !bSniping) {
      // render weapons only if view is from player eyes
      ((CPlayerWeapons&)*m_penWeapons).RenderWeaponModel(prProjection, pdp, 
       vViewerLightDirection, colViewerLight, colViewerAmbient, bRenderWeapon, iEye);
    }

    // if is first person
    if (m_iViewState == PVT_PLAYEREYES)
    {
      prProjection.ViewerPlacementL() = plViewOld;
      prProjection.Prepare();
      CAnyProjection3D apr;
      apr = prProjection;
      Stereo_AdjustProjection(*apr, iEye, 1);
      Particle_PrepareSystem(pdp, apr);
      Particle_PrepareEntity( 2.0f, FALSE, FALSE, this);
      RenderChainsawParticles(FALSE);
      Particle_EndSystem();
    }

    // render crosshair if sniper zoom not active
    CPlacement3D plView;
    if (m_iViewState == PVT_PLAYEREYES) {
      // player view
      plView = en_plViewpoint;
      plView.RelativeToAbsolute(GetPlacement());
    } else if (m_iViewState == PVT_3RDPERSONVIEW) {
      // camera view
      plView = ((CPlayerView&)*m_pen3rdPersonView).GetPlacement();
    }
    if (!bSniping) {
      ((CPlayerWeapons&)*m_penWeapons).RenderCrosshair(prProjection, pdp, plView);
    }

    // get your prediction tail
    CPlayer *pen = (CPlayer*)GetPredictionTail();
    // do screen blending
    ULONG ulR=255, ulG=0, ulB=0; // red for wounding
    ULONG ulA = pen->m_fDamageAmmount*5.0f;
    
    // if less than few seconds elapsed since last damage
    FLOAT tmSinceWounding = _pTimer->CurrentTick() - pen->m_tmWoundedTime;
    if( tmSinceWounding<4.0f) {
      // decrease damage ammount
      if( tmSinceWounding<0.001f) { ulA = (ulA+64)/2; }
    }

    // add rest of blend ammount

	
	// * H3D Shield glaring *********************************************************************************************

    FLOAT tmSinceShieldWounding = _pTimer->CurrentTick() - pen->m_tmShieldWoundTime;
   	
    if (m_fShieldDamageAmmount>0) {
		  if(tmSinceShieldWounding<4.0f) {
		  	ulA = pen->m_fShieldDamageAmmount*3.0f;
		  	// decrease damage ammount
		  	if( tmSinceShieldWounding<0.001f) { ulA = (ulA+64)/2; }
		  	// do screen blending
		    ulR=0; ulG=64; ulB=255; // blue for wounding
	  	}
  	}

	// ******************************************************************************************************************

  // * H3D Glare of destroyed shield **********************************************************************************

    FLOAT tmSinceShieldBroken = _pTimer->CurrentTick() - pen->m_tmShieldBroken;
   	
    if (m_fShieldBrokenAmmount>0) {
		  if(tmSinceShieldBroken<1.0f) {
		  	ulA = pen->m_fShieldBrokenAmmount*3.0f;
		  	// decrease damage ammount
		  	if( tmSinceShieldBroken<0.001f) { ulA = (ulA+64)/2; }
		  	// do screen blending
		    ulR=0; ulG=64; ulB=255; // blue for wounding
	  	}
  	}

	// ******************************************************************************************************************

    ulA = ClampUp( ulA, (ULONG)224);
    if (m_iViewState == PVT_PLAYEREYES) {
      pdp->dp_ulBlendingRA += ulR*ulA;
      pdp->dp_ulBlendingGA += ulG*ulA;
      pdp->dp_ulBlendingBA += ulB*ulA;
      pdp->dp_ulBlendingA  += ulA;
    }

    // add world glaring
    {
      COLOR colGlare = GetWorldGlaring();
      UBYTE ubR, ubG, ubB, ubA;
      ColorToRGBA(colGlare, ubR, ubG, ubB, ubA);
      if (ubA!=0) {
        pdp->dp_ulBlendingRA += ULONG(ubR)*ULONG(ubA);
        pdp->dp_ulBlendingGA += ULONG(ubG)*ULONG(ubA);
        pdp->dp_ulBlendingBA += ULONG(ubB)*ULONG(ubA);
        pdp->dp_ulBlendingA  += ULONG(ubA);
      }
    }

    // do all queued screen blendings
    pdp->BlendScreen();

    // render status info line (if needed)
    if( hud_bShowInfo) { 
      if (IsPredicted()) {
         DrawHUD( (CPlayer*)GetPredictor(), pdp);
      }
      else {
         DrawHUD(this, pdp);
      }
    }

    if (!m_bShowingTabInfo) {
		if(IsPredicted()) {
		  ((CPlayer*)GetPredictor())->RenderH3D(prProjection, pdp, 
			vViewerLightDirection, colViewerLight, colViewerAmbient, bRenderWeapon, iEye);
		}
		else {
		  RenderH3D(prProjection, pdp, 
			vViewerLightDirection, colViewerLight, colViewerAmbient, bRenderWeapon, iEye);
		}
	}
  }


/************************************************************
 *                  SPECIAL FUNCTIONS                       *
 ************************************************************/
  // try to find start marker for deathmatch (re)spawning
  CEntity *GetDeathmatchStartMarker(void)
  {
    // get number of markers
    CTString strPlayerStart = "Player Start - ";
    INDEX ctMarkers = _pNetwork->GetNumberOfEntitiesWithName(strPlayerStart);
    // if none
    if (ctMarkers==0) {
      // fail
      return NULL;
    }
    // if only one
    if (ctMarkers==1) {
      // get that one
      return _pNetwork->GetEntityWithName(strPlayerStart, 0);
    }
    // if at least two markers found...

    // create tables of markers and their distances from players
    CStaticArray<MarkerDistance> amdMarkers;
    amdMarkers.New(ctMarkers);
    // for each marker
    {for(INDEX iMarker=0; iMarker<ctMarkers; iMarker++) {
      amdMarkers[iMarker].md_ppm = (CPlayerMarker*)_pNetwork->GetEntityWithName(strPlayerStart, iMarker);
      if (amdMarkers[iMarker].md_ppm==NULL) {
        return NULL;  // (if there is any invalidity, fail completely)
      }
      // get min distance from any player
      FLOAT fMinD = UpperLimit(0.0f);
      for (INDEX iPlayer=0; iPlayer<GetMaxPlayers(); iPlayer++) {
        CPlayer *ppl = (CPlayer *)&*GetPlayerEntity(iPlayer);
        if (ppl==NULL) { 
          continue;
        }
        FLOAT fD = 
          (amdMarkers[iMarker].md_ppm->GetPlacement().pl_PositionVector-
           ppl->GetPlacement().pl_PositionVector).Length();
        if (fD<fMinD) {
          fMinD = fD;
        }
      }
      amdMarkers[iMarker].md_fMinD = fMinD;
    }}

    // now sort the list
    qsort(&amdMarkers[0], ctMarkers, sizeof(amdMarkers[0]), &qsort_CompareMarkerDistance);
    ASSERT(amdMarkers[0].md_fMinD>=amdMarkers[ctMarkers-1].md_fMinD);
    // choose marker among one of the 50% farthest
    INDEX ctFarMarkers = ctMarkers/2;
    ASSERT(ctFarMarkers>0);
    INDEX iStartMarker = IRnd()%ctFarMarkers;
    // find first next marker that was not used lately
    INDEX iMarker=iStartMarker;
    FOREVER{
      if (_pTimer->CurrentTick()>amdMarkers[iMarker].md_ppm->m_tmLastSpawned+1.0f) {
        break;
      }
      iMarker = (iMarker+1)%ctMarkers;
      if (iMarker==iStartMarker) {
        break;
      }
    }
    // return that
    return amdMarkers[iMarker].md_ppm;
  }

/************************************************************
 *                  INITIALIZE PLAYER                       *
 ************************************************************/

  void InitializePlayer()
  {
    // set viewpoint position inside the entity
    en_plViewpoint.pl_OrientationAngle = ANGLE3D(0,0,0);
    en_plViewpoint.pl_PositionVector = FLOAT3D(0.0f, plr_fViewHeightStand, 0.0f);
    en_plLastViewpoint = en_plViewpoint;

    // clear properties
    m_ulFlags &= PLF_INITIALIZED|PLF_LEVELSTARTED|PLF_RESPAWNINPLACE;  // must not clear initialized flag
    m_fFallTime = 0.0f;
    m_pstState = PST_STAND;
    m_fDamageAmmount = 0.0f;
    m_tmWoundedTime  = 0.0f;
    m_tmInvisibility    = 0.0f;//, 
    m_tmInvulnerability = 0.0f;//, 
    m_tmSeriousDamage   = 0.0f;//, 
    m_tmSeriousSpeed    = 0.0f;//,

    // initialize animator
    ((CPlayerAnimator&)*m_penAnimator).Initialize();
    // restart weapons if needed
    GetPlayerWeapons()->SendEvent(EStart());

    // initialise last positions for particles
    Particles_AfterBurner_Prepare(this);

    // set flags
    SetPhysicsFlags(EPF_MODEL_WALKING|EPF_HASLUNGS);
    SetCollisionFlags(ECF_MODEL|((ECBI_PLAYER)<<ECB_IS));
    SetFlags(GetFlags()|ENF_ALIVE);
    // animation
    StartModelAnim(PLAYER_ANIM_STAND, AOF_LOOPING);
    TeleportPlayer(WLT_FIXED);
  };


  FLOAT3D GetTeleportingOffset(void)
  {
    // find player index
    INDEX iPlayer = GetMyPlayerIndex();

    // create offset from marker
    const FLOAT fOffsetY = 0.1f;  // how much to offset up (as precaution not to spawn in floor)
    FLOAT3D vOffsetRel = FLOAT3D(0,fOffsetY,0);
    if (GetSP()->sp_bCooperative && !GetSP()->sp_bSinglePlayer) {
      INDEX iRow = iPlayer/4;
      INDEX iCol = iPlayer%4;
      vOffsetRel = FLOAT3D(-3.0f+iCol*2.0f, fOffsetY, -3.0f+iRow*2.0f);
    }

    return vOffsetRel;
  }
  

  void RemapLevelNames(INDEX &iLevel)
  {
	  switch(iLevel) {
    case 10:
      iLevel = 1;
      break;
    case 11:
		  iLevel = 2;
		  break;
	  case 12:
		  iLevel = 3;
		  break;
	  case 13:
		  iLevel = 4;
		  break;
	  case 14:
		  iLevel = 5;
		  break;
	  case 15:
		  iLevel = 6;
		  break;
	  case 21:
		  iLevel = 7;
		  break;
	  case 22:
		  iLevel = 8;
		  break;
	  case 23:
		  iLevel = 9;
		  break;
	  case 24:
		  iLevel = 10;
		  break;
	  case 31:
		  iLevel = 11;
		  break;
	  case 32:
		  iLevel = 12;
		  break;
	  case 33:
		  iLevel = 13;
		  break;
	  default:
		  iLevel = -1;
		  break;
	  }
  }
  
  
  void TeleportPlayer(enum WorldLinkType EwltType) 
  {

	
    INDEX iLevel = -1;
    CTString strLevelName = GetWorld()->wo_fnmFileName.FileName();
    
    //strLevelName.ScanF("%02d_", &iLevel);
    INDEX u, v;
    u = v = -1;
    strLevelName.ScanF("%01d_%01d_", &u, &v);
    iLevel = u*10+v;
    
	  RemapLevelNames(iLevel);
            
    if (iLevel>0) {
      ((CSessionProperties*)GetSP())->sp_ulLevelsMask|=1<<(iLevel-1);
    }

    // find player index
    INDEX iPlayer = GetMyPlayerIndex();
    // player placement
    CPlacement3D plSet = GetPlacement();
    // teleport in dummy space to avoid auto teleport frag
    Teleport(CPlacement3D(FLOAT3D(32000.0f+100.0f*iPlayer, 32000.0f, 0), ANGLE3D(0, 0, 0)));
    // force yourself to standing state
    ForceCollisionBoxIndexChange(PLAYER_COLLISION_BOX_STAND);
    en_plViewpoint.pl_PositionVector(2) = plr_fViewHeightStand;
    ((CPlayerAnimator&)*m_penAnimator).m_bDisableAnimating = FALSE;
    ((CPlayerAnimator&)*m_penAnimator).Stand();
    m_pstState = PST_STAND;

    // create offset from marker
    FLOAT3D vOffsetRel = GetTeleportingOffset();

    // no player start initially
    BOOL bSetHealth = FALSE;      // for getting health from marker
    BOOL bAdjustHealth = FALSE;   // for getting adjusting health to 50-100 interval
    CEntity *pen = NULL;
    if (GetSP()->sp_bCooperative) {
      if (cht_iGoToMarker>=0) {
        // try to find fast go marker
        CTString strPlayerStart;
        strPlayerStart.PrintF("Player Start - %d", (INDEX)cht_iGoToMarker);
        pen = _pNetwork->GetEntityWithName(strPlayerStart, 0);
        pen->SendEvent(ETrigger());
        cht_iGoToMarker = -1;
        bSetHealth = TRUE;
        bAdjustHealth = FALSE;
      // if there is coop respawn marker
      } else if (m_penMainMusicHolder!=NULL && !(m_ulFlags&PLF_CHANGINGLEVEL)) {
        CMusicHolder *pmh = (CMusicHolder *)&*m_penMainMusicHolder;
        if (pmh->m_penRespawnMarker!=NULL) {
          // get it
          pen = pmh->m_penRespawnMarker;
          bSetHealth = TRUE;
          bAdjustHealth = FALSE;
        }
      }

      // if quick start is enabled (in wed)
      if (pen==NULL && GetSP()->sp_bQuickTest && m_strGroup=="") {
        // try to find quick start marker
        CTString strPlayerStart;
        strPlayerStart.PrintF("Player Quick Start");
        pen = _pNetwork->GetEntityWithName(strPlayerStart, 0);
        bSetHealth = TRUE;
        bAdjustHealth = FALSE;
      }
      // if no start position yet
      if (pen==NULL) {
        // try to find normal start marker
        CTString strPlayerStart;
        strPlayerStart.PrintF("Player Start - %s", m_strGroup);
        pen = _pNetwork->GetEntityWithName(strPlayerStart, 0);
        if (m_strGroup=="") {
          bSetHealth = TRUE;
          bAdjustHealth = FALSE;
        } else {
          if (EwltType==WLT_FIXED) {
            bSetHealth = FALSE;
            bAdjustHealth = TRUE;
          } else {
            bSetHealth = FALSE;
            bAdjustHealth = FALSE;
          }
        }
      }
      // if no start position yet
      if (pen==NULL) {
        // try to find normal start marker without group anyway
        CTString strPlayerStart;
        strPlayerStart.PrintF("Player Start - ");
        pen = _pNetwork->GetEntityWithName(strPlayerStart, 0);
        bSetHealth = TRUE;
        bAdjustHealth = FALSE;
      }
    } else {
      bSetHealth = TRUE;
      bAdjustHealth = FALSE;
      // try to find start marker by random
      pen = GetDeathmatchStartMarker();
      if (pen!=NULL) {
        ((CPlayerMarker&)*pen).m_tmLastSpawned = _pTimer->CurrentTick();
      }
    }

    // if respawning in place
    if ((m_ulFlags&PLF_RESPAWNINPLACE) && pen!=NULL && !((CPlayerMarker*)&*pen)->m_bNoRespawnInPlace) {
      m_ulFlags &= ~PLF_RESPAWNINPLACE;
      // set default params
      SetHealth(TopHealth());
      m_iMana  = GetSP()->sp_iInitialMana;
      m_fArmor = 0.0f;
      m_fShield= 0.0f;
      // teleport where you were when you were killed
      Teleport(CPlacement3D(m_vDied, m_aDied));

    // if start marker is found
    } else if (pen!=NULL) {
      // if there is no respawn marker yet
      if (m_penMainMusicHolder!=NULL) {
        CMusicHolder *pmh = (CMusicHolder *)&*m_penMainMusicHolder;
        if (pmh->m_penRespawnMarker==NULL) {
          // set it
          pmh->m_penRespawnMarker = pen;
        }
      }

      CPlayerMarker &CpmStart = (CPlayerMarker&)*pen;
      // set player characteristics
      if (bSetHealth) {
        SetHealth(CpmStart.m_fHealth/100.0f*TopHealth());
        m_iMana  = GetSP()->sp_iInitialMana;
        m_fArmor = CpmStart.m_fShield;
      } else if (bAdjustHealth) {
        FLOAT fHealth = GetHealth();
        FLOAT fTopHealth = TopHealth();
        if( fHealth < fTopHealth) {
          SetHealth(ClampUp(fHealth+fTopHealth/2.0f, fTopHealth));
        }
      }

      // if should start in computer
      if (CpmStart.m_bStartInComputer && GetSP()->sp_bSinglePlayer) {
        // mark that
        if (_pNetwork->IsPlayerLocal(this)) {
          cmp_ppenPlayer = this;
        }
        cmp_bInitialStart = TRUE;
      }

      // start with first message linked to the marker
      CMessageHolder *penMessage = (CMessageHolder *)&*CpmStart.m_penMessage;
      // while there are some messages to add
      while (penMessage!=NULL && IsOfClass(penMessage, "MessageHolder")) {
        const CTFileName &fnmMessage = penMessage->m_fnmMessage;
        // if player doesn't have that message in database
        if (!HasMessage(fnmMessage)) {
          // add the message
          ReceiveComputerMessage(fnmMessage, 0);
        }
        // go to next message holder in list
        penMessage = (CMessageHolder *)&*penMessage->m_penNext;
      }

      // set weapons
      if (!GetSP()->sp_bCooperative) {
        ((CPlayerWeapons&)*m_penWeapons).InitializeWeapons(CpmStart.m_iGiveWeapons, 0, 0,
          CpmStart.m_fMaxAmmoRatio);
      } else {
        ((CPlayerWeapons&)*m_penWeapons).InitializeWeapons(CpmStart.m_iGiveWeapons, CpmStart.m_iTakeWeapons,
          GetSP()->sp_bInfiniteAmmo?0:CpmStart.m_iTakeAmmo, CpmStart.m_fMaxAmmoRatio);
      }
      // start position relative to link
      if (EwltType == WLT_RELATIVE) {
        plSet.AbsoluteToRelative(_SwcWorldChange.plLink);   // relative to link position
        plSet.RelativeToAbsolute(CpmStart.GetPlacement());  // absolute to start marker position
        Teleport(plSet);
      // fixed start position
      } else if (EwltType == WLT_FIXED) {
        CPlacement3D plNew = CpmStart.GetPlacement();
        vOffsetRel*=CpmStart.en_mRotation;
        plNew.pl_PositionVector += vOffsetRel;
        Teleport(plNew);
      // error -> teleport to zero
      } else {
        ASSERTALWAYS("Unknown world link type");
        Teleport(CPlacement3D(FLOAT3D(0, 0, 0)+vOffsetRel, ANGLE3D(0, 0, 0)));
      }
      // if there is a start trigger target
      if(CpmStart.m_penTarget!=NULL) {
        SendToTarget(CpmStart.m_penTarget, EET_TRIGGER, this);
      }

    // default start position
    } else {
      // set player characteristics
      SetHealth(TopHealth());
      m_iMana = GetSP()->sp_iInitialMana;
      m_fArmor = 0.0f;
	    m_fShield = m_fMaxShield;
      // set weapons
      ((CPlayerWeapons&)*m_penWeapons).InitializeWeapons(0, 0, 0, 0);
      // start position
      Teleport(CPlacement3D(FLOAT3D(0, 0, 0)+vOffsetRel, ANGLE3D(0, 0, 0)));
    }
    // send teleport event to all entities in range
    SendEventInRange(ETeleport(), FLOATaabbox3D(GetPlacement().pl_PositionVector, 200.0f));
    // stop moving
    ForceFullStop();

    // remember maximum health
    m_fMaxHealth = TopHealth();

    // if in singleplayer mode
    if (GetSP()->sp_bSinglePlayer && GetSP()->sp_gmGameMode!=CSessionProperties::GM_FLYOVER) {
      CWorldSettingsController *pwsc = GetWSC(this);
      if (pwsc!=NULL && pwsc->m_bNoSaveGame) {
        NOTHING;
      } else {
        // save quick savegame
        _pShell->Execute("gam_bQuickSave=1;");
      }
    }
    // remember level start time
    if (!(m_ulFlags&PLF_LEVELSTARTED)) {
      m_ulFlags |= PLF_LEVELSTARTED;
      m_tmLevelStarted = _pNetwork->GetGameTime();
    }

    // reset model appearance
    CTString strDummy;
    SetPlayerAppearance(GetModelObject(), NULL, strDummy, /*bPreview=*/FALSE);
    ValidateCharacter();
    SetPlayerAppearance(&m_moRender, &en_pcCharacter, strDummy, /*bPreview=*/FALSE);
    ParseGender(strDummy);
    GetPlayerAnimator()->SetWeapon();
    m_ulFlags |= PLF_SYNCWEAPON;

    // spawn teleport effect
    SpawnTeleport();
    // return from editor model (if was fragged into pieces)
    SwitchToModel();
    m_tmSpawned = _pTimer->CurrentTick();

    en_tmLastBreathed = _pTimer->CurrentTick()+0.1f;  // do not take breath when spawned in air
  };

  // note: set estimated time in advance
  void RecordEndOfLevelData(void)
  {
    // must not be called multiple times
    ASSERT(!m_bEndOfLevel);
    // clear analyses message
    m_tmAnalyseEnd = 0;
    m_bPendingMessage = FALSE;
    m_tmMessagePlay = 0;
    // mark end of level
    m_iMayRespawn = 0;
    m_bEndOfLevel = TRUE;
    // remember end time
    time(&m_iEndTime);
    // add time score
    TIME tmLevelTime = _pTimer->CurrentTick()-m_tmLevelStarted;
    m_psLevelStats.ps_tmTime = tmLevelTime;
    m_psGameStats.ps_tmTime += tmLevelTime;
    FLOAT fTimeDelta = ClampDn(floor(m_tmEstTime)-floor(tmLevelTime), 0.0);
    m_iTimeScore = floor(fTimeDelta*100.0f);
    m_psLevelStats.ps_iScore+=m_iTimeScore;
    m_psGameStats.ps_iScore+=m_iTimeScore;

    // record stats for this level and add to global table
    CTString strStats;
    strStats.PrintF(TRANS("%s\n  Time:   %s\n  Score: %9d\n  Kills:   %03d/%03d\n  Secrets:   %02d/%02d\n"), 
        TranslateConst(en_pwoWorld->GetName(), 0), TimeToString(tmLevelTime), 
        m_psLevelStats.ps_iScore,
        m_psLevelStats.ps_iKills, m_psLevelTotal.ps_iKills,
        m_psLevelStats.ps_iSecrets, m_psLevelTotal.ps_iSecrets);
    m_strLevelStats += strStats;
  }

  // spawn teleport effect
  void SpawnTeleport(void)
  {
    // if in singleplayer
    if (GetSP()->sp_bSinglePlayer) {
      // no spawn effects
      return;
    }
    ESpawnEffect ese;
    ese.colMuliplier = C_WHITE|CT_OPAQUE;
    ese.betType = BET_TELEPORT;
    ese.vNormal = FLOAT3D(0,1,0);
    FLOATaabbox3D box;
    GetBoundingBox(box);
    FLOAT fEntitySize = box.Size().MaxNorm()*2;
    ese.vStretch = FLOAT3D(fEntitySize, fEntitySize, fEntitySize);
    CEntityPointer penEffect = CreateEntity(GetPlacement(), CLASS_BASIC_EFFECT);
    penEffect->Initialize(ese);
  }



  // render particles
  void RenderParticles(void)
  {
    FLOAT tmNow = _pTimer->GetLerpedCurrentTick();
    
    // render empty shells
    Particles_EmptyShells( this, m_asldData);

    if (Particle_GetViewer()==this) {
      Particles_ViewerLocal(this);
      if (m_tmShieldBroken+1.0f>tmNow) {
        Particles_SummonerExplode(this, m_vShieldBroken, 3.0f, 0.1f, m_tmShieldBroken, 1.0f);
      }
    }
    else
    {
      // if is not first person
      RenderChainsawParticles(TRUE);
      // glowing powerups
      if (GetFlags()&ENF_ALIVE){
        if (m_tmSeriousDamage>tmNow && m_tmInvulnerability>tmNow) {
          Particles_ModelGlow(this, Max(m_tmSeriousDamage,m_tmInvulnerability),PT_STAR08, 0.15f, 2, 0.03f, 0xff00ff00);
        } else if (m_tmInvulnerability>tmNow) {
          Particles_ModelGlow(this, m_tmInvulnerability, PT_STAR05, 0.15f, 2, 0.03f, 0x3333ff00);
        } else if (m_tmSeriousDamage>tmNow) {
          Particles_ModelGlow(this, m_tmSeriousDamage, PT_STAR08, 0.15f, 2, 0.03f, 0xff777700);
        }
        if (m_tmSeriousSpeed>tmNow) {
          Particles_RunAfterBurner(this, m_tmSeriousSpeed, 0.3f, 0);
        }
        if (m_tmShieldWoundTime+0.5f>tmNow) {                                                                                 // * H3D - Render ShieldWound *********
          Particles_ModelGlow(this, m_tmShieldWoundTime+0.5f, PT_STAR05, 0.15f, 2, 0.03f, 0x3333ff00);
        }
        if (m_tmShieldBroken+1.0f>tmNow) {
          Particles_SummonerExplode(this, m_vShieldBroken, 3.0f, 0.1f, m_tmShieldBroken, 1.0f);
        }
        if (!GetSP()->sp_bCooperative) {
          CPlayerWeapons *wpn = GetPlayerWeapons();
          if (wpn->m_tmLastSniperFire == _pTimer->CurrentTick())
          {
            CAttachmentModelObject &amoBody = *GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO);
            FLOATmatrix3D m;
            MakeRotationMatrix(m, amoBody.amo_plRelative.pl_OrientationAngle);
            FLOAT3D vSource = wpn->m_vBulletSource + FLOAT3D(0.0f, 0.1f, -0.4f)*GetRotationMatrix()*m;
            Particles_SniperResidue(this, vSource , wpn->m_vBulletTarget);
          }
        }
      }
    }
            
    // spirit particles
    if( m_tmSpiritStart != 0.0f)
    {
      Particles_Appearing(this, m_tmSpiritStart);
    }
  }

  void TeleportToAutoMarker(CPlayerActionMarker *ppam) 
  {
    // if we are in coop
    if (GetSP()->sp_bCooperative && !GetSP()->sp_bSinglePlayer) {
      // for each player
      for(INDEX iPlayer=0; iPlayer<GetMaxPlayers(); iPlayer++) {
        CPlayer *ppl = (CPlayer*)GetPlayerEntity(iPlayer);
        if (ppl!=NULL) {
          // put it at marker
          CPlacement3D pl = ppam->GetPlacement();
          FLOAT3D vOffsetRel = ppl->GetTeleportingOffset();
          pl.pl_PositionVector += vOffsetRel*ppam->en_mRotation;
          ppl->Teleport(pl, FALSE);
          // remember new respawn place
          ppl->m_vDied = pl.pl_PositionVector;
          ppl->m_aDied = pl.pl_OrientationAngle;
        }
      }

    // otherwise
    } else {
      // put yourself at marker
      CPlacement3D pl = ppam->GetPlacement();
      FLOAT3D vOffsetRel = GetTeleportingOffset();
      pl.pl_PositionVector += vOffsetRel*ppam->en_mRotation;
      Teleport(pl, FALSE);
    }
  }

  // check whether this time we respawn in place or on marker
  void CheckDeathForRespawnInPlace(EDeath eDeath)
  {
    // if respawning in place is not allowed
    if (!GetSP()->sp_bRespawnInPlace) {
      // skip further checks
      return;
    }
    // if killed by a player or enemy
    CEntity *penKiller = eDeath.eLastDamage.penInflictor;
    if (IsOfClass(penKiller, "Player") || IsDerivedFromClass(penKiller, "Enemy Base")) {
      // mark for respawning in place
      m_ulFlags |= PLF_RESPAWNINPLACE;
      m_vDied = GetPlacement().pl_PositionVector;
      m_aDied = GetPlacement().pl_OrientationAngle;
    }
  }

procedures:
/************************************************************
 *                       WOUNDED                            *
 ************************************************************/
  Wounded(EDamage eDamage) {
    return;
  };


/************************************************************
 *                     WORLD CHANGE                         *
 ************************************************************/
  WorldChange() {
    InitAniNum();
    // if in single player
    if (GetSP()->sp_bSinglePlayer) {
      // mark world as visited
      CTString strDummy("1");
      SaveStringVar(GetWorld()->wo_fnmFileName.NoExt()+".vis", strDummy);
    }
    // find music holder on new world
    FindMusicHolder();
	CheckShopInTheWorld();
    // store group name
    m_strGroup = _SwcWorldChange.strGroup;
    TeleportPlayer((WorldLinkType)_SwcWorldChange.iType);
    // setup light source
    SetupLightSource();

    // make sure we discontinue zooming
    CPlayerWeapons *penWeapon = GetPlayerWeapons();
    penWeapon->m_fSniperFOVlast = penWeapon->m_fSniperFOV = penWeapon->m_fSniperMaxFOV;      
    penWeapon->m_bSniping=FALSE;
    m_ulFlags&=~PLF_ISZOOMING;

	// turn off possible chainsaw engine sound
	PlaySound(m_soWeaponAmbient, SOUND_SILENCE, SOF_3D);
	
    // update per-level stats
    UpdateLevelStats();
    m_ulFlags |= PLF_INITIALIZED;
    m_ulFlags &= ~PLF_CHANGINGLEVEL;
    return;
  };

  WorldChangeDead() 
  {
    InitAniNum();
    // forbid respawning in-place when changing levels while dead
    m_ulFlags &= ~PLF_RESPAWNINPLACE;

    // if in single player
    if (GetSP()->sp_bSinglePlayer) {
      // mark world as visited
      CTString strDummy("1");
      SaveStringVar(GetWorld()->wo_fnmFileName.NoExt()+".vis", strDummy);
    }
    // find music holder on new world
    FindMusicHolder();
	CheckShopInTheWorld();
    // store group name

    autocall Rebirth() EReturn;

    // setup light source
    SetupLightSource();

    // update per-level stats
    UpdateLevelStats();
    m_ulFlags |= PLF_INITIALIZED;
    m_ulFlags &= ~PLF_CHANGINGLEVEL;
    return;
  }

/************************************************************
 *                       D E A T H                          *
 ************************************************************/

  Death(EDeath eDeath)
  {
    // stop firing when dead
    ((CPlayerWeapons&)*m_penWeapons).SendEvent(EReleaseWeapon());
    // stop all looping ifeel effects
    if(_pNetwork->IsPlayerLocal(this))
    {
      IFeel_StopEffect("ChainsawFire");
      IFeel_StopEffect("FlamethrowerFire");
      IFeel_StopEffect("ChainsawIdle");
      IFeel_StopEffect("SniperZoom");
      IFeel_StopEffect("Minigun_rotate");
    }
    
    // make sure sniper zoom is stopped 
    CPlayerWeapons *penWeapon = GetPlayerWeapons();
    m_ulFlags&=~PLF_ISZOOMING;
    penWeapon->m_bSniping = FALSE;
    penWeapon->m_fSniperFOVlast = penWeapon->m_fSniperFOV = penWeapon->m_fSniperMaxFOV;
    
    // stop weapon sounds
    PlaySound(m_soSniperZoom, SOUND_SILENCE, SOF_3D);
    PlaySound(m_soWeaponAmbient, SOUND_SILENCE, SOF_3D);

	// stop rotating minigun
	penWeapon->m_aMiniGunLast = penWeapon->m_aMiniGun;
    
    // if in single player, or if this is a predictor entity
    if (GetSP()->sp_bSinglePlayer || IsPredictor()) {
      // do not print anything
      NOTHING;
    // if in cooperative, but not single player
    } else if (GetSP()->sp_bCooperative) {
		if (!m_bSpectatorDeath) {
		  // just print death message, no score updating
		  PrintPlayerDeathMessage(this, eDeath);
		  // check whether this time we respawn in place or on marker
		  CheckDeathForRespawnInPlace(eDeath);
		  // increase number of deaths
		  m_psLevelStats.ps_iDeaths += 1;
		  m_psGameStats.ps_iDeaths += 1;
		}
    // if not in cooperative, and not single player
    } else {
      // print death message
      PrintPlayerDeathMessage(this, eDeath);
      // get the killer pointer
      CEntity *penKiller = eDeath.eLastDamage.penInflictor;
      // initially, not killed by a player
      CPlayer *pplKillerPlayer = NULL;

      // if killed by some entity
      if (penKiller!=NULL) {
        // if killed by player
        if (IsOfClass(penKiller, "Player")) {
          // if someone other then you
          if (penKiller!=this) {
            pplKillerPlayer = (CPlayer*)penKiller;
            EReceiveScore eScore;
            eScore.iPoints = m_iMana;
            eDeath.eLastDamage.penInflictor->SendEvent(eScore);
            eDeath.eLastDamage.penInflictor->SendEvent(EKilledEnemy());
          // if it was yourself
          } else {
            m_psLevelStats.ps_iScore -= m_iMana;
            m_psGameStats.ps_iScore -= m_iMana;
            m_psLevelStats.ps_iKills -= 1;
            m_psGameStats.ps_iKills -= 1;
          }
        // if killed by non-player
        } else {
          m_psLevelStats.ps_iScore -= m_iMana;
          m_psGameStats.ps_iScore -= m_iMana;
          m_psLevelStats.ps_iKills -= 1;
          m_psGameStats.ps_iKills -= 1;
        }
      // if killed by NULL (shouldn't happen, but anyway)
      } else {
        m_psLevelStats.ps_iScore -= m_iMana;
        m_psGameStats.ps_iScore -= m_iMana;
        m_psLevelStats.ps_iKills -= 1;
        m_psGameStats.ps_iKills -= 1;
      }

      // if playing scorematch
      if (!GetSP()->sp_bUseFrags) {
        // if killed by a player
        if (pplKillerPlayer!=NULL) {
          // print how much that player gained
          CPrintF(TRANS("  %s: +%d points\n"), pplKillerPlayer->GetPlayerName(), m_iMana);
        // if it was a suicide, or an accident
        } else {
          // print how much you lost
          CPrintF(TRANS("  %s: -%d points\n"), GetPlayerName(), m_iMana);
        }
      }

      // increase number of deaths
      m_psLevelStats.ps_iDeaths += 1;
      m_psGameStats.ps_iDeaths += 1;
    }

    // store last view
    m_iLastViewState = m_iViewState;

    // mark player as death
    SetFlags(GetFlags()&~ENF_ALIVE);
    // stop player
    SetDesiredTranslation(FLOAT3D(0.0f, 0.0f, 0.0f));
    SetDesiredRotation(ANGLE3D(0.0f, 0.0f, 0.0f));

    // remove weapon from hand
    ((CPlayerAnimator&)*m_penAnimator).RemoveWeapon();
    // kill weapon animations
    GetPlayerWeapons()->SendEvent(EStop());

    // if in deathmatch
    if (!GetSP()->sp_bCooperative) {
      // drop current weapon as item so others can pick it
      GetPlayerWeapons()->DropWeapon();
    }


    // play death
    INDEX iAnim1;
    INDEX iAnim2;
    if (m_pstState == PST_SWIM || m_pstState == PST_DIVE) {
      iAnim1 = PLAYER_ANIM_DEATH_UNDERWATER;
      iAnim2 = BODY_ANIM_DEATH_UNDERWATER;
    } else if (eDeath.eLastDamage.dmtType==DMT_SPIKESTAB) {
      iAnim1 = PLAYER_ANIM_DEATH_SPIKES;
      iAnim2 = BODY_ANIM_DEATH_SPIKES;
    } else if (eDeath.eLastDamage.dmtType==DMT_ABYSS) {
      iAnim1 = PLAYER_ANIM_ABYSSFALL;
      iAnim2 = BODY_ANIM_ABYSSFALL;
    } else {
      FLOAT3D vFront;
      GetHeadingDirection(0, vFront);
      FLOAT fDamageDir = m_vDamage%vFront;
      if (fDamageDir<0) {
        if (Abs(fDamageDir)<10.0f) {
          iAnim1 = PLAYER_ANIM_DEATH_EASYFALLBACK;
          iAnim2 = BODY_ANIM_DEATH_EASYFALLBACK;
        } else {
          iAnim1 = PLAYER_ANIM_DEATH_BACK;
          iAnim2 = BODY_ANIM_DEATH_BACK;
        }
      } else {
        if (Abs(fDamageDir)<10.0f) {
          iAnim1 = PLAYER_ANIM_DEATH_EASYFALLFORWARD;
          iAnim2 = BODY_ANIM_DEATH_EASYFALLFORWARD;
        } else {
          iAnim1 = PLAYER_ANIM_DEATH_FORWARD;
          iAnim2 = BODY_ANIM_DEATH_FORWARD;
        }
      }
    }
    en_plViewpoint.pl_OrientationAngle = ANGLE3D(0,0,0);
    StartModelAnim(iAnim1, 0);
    CModelObject &moBody = GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
    moBody.PlayAnim(iAnim2, 0);

    // set physic flags
    SetPhysicsFlags(EPF_MODEL_CORPSE);
    SetCollisionFlags(ECF_CORPSE);

    // set density to float out of water
    en_fDensity = 400.0f;

    // play sound
	if (!m_bSpectatorDeath) {
		if (m_pstState==PST_DIVE) {
		  SetDefaultMouthPitch();
		  PlaySound(m_soMouth, GenderSound(SOUND_DEATHWATER), SOF_3D);
		  if(_pNetwork->IsPlayerLocal(this)) {IFeel_PlayEffect("DeathWater");}
		} else {
		  SetDefaultMouthPitch();
		  PlaySound(m_soMouth, GenderSound(SOUND_DEATH), SOF_3D);
		  if(_pNetwork->IsPlayerLocal(this)) {IFeel_PlayEffect("Death");}
		}
	}

    // initialize death camera view
    ASSERT(m_penView == NULL);
    if (m_penView == NULL) {
      m_penView = CreateEntity(GetPlacement(), CLASS_PLAYER_VIEW);
      EViewInit eInit;
      eInit.penOwner = this;
      eInit.penCamera = NULL;
      eInit.vtView = VT_PLAYERDEATH;
      eInit.bDeathFixed = eDeath.eLastDamage.dmtType==DMT_ABYSS;
      m_penView->Initialize(eInit);
    }
                     
    if (ShouldBlowUp()) {
      BlowUp();
    } else {
      // leave a stain beneath
		if (!m_bSpectatorDeath) {
			LeaveStain(TRUE);
		}
    }

	if (m_bSpectatorDeath) {
		SetHealth(0);
		m_fArmor = 0.0f;
		m_fShield = 0.0f;
    m_fMaxShield = 0.0f;
		SwitchToEditorModel();
		SwitchSpectatorPlayer();
		m_bSpectatorDeath = FALSE;
	}
	
	if (GetSP()->sp_bCooperative && !GetSP()->sp_bSinglePlayer) {
		if (GetSP()->sp_ctCreditsLeft==0) {
			m_penWorldLinkController->SendEvent(ETrigger());
		}
	}

    m_iMayRespawn = 0;
    // wait for anim of death
    wait (1.2f) {
      on (EBegin) : {
        // set new view status
        m_iViewState = PVT_PLAYERAUTOVIEW;
        resume;
      }
      // when anim is finished
      on (ETimer) : {
        // allow respawning
        m_iMayRespawn = 1;
        resume;
      }
      // when damaged
      on (EDamage eDamage) : { 
        if (eDamage.dmtType==DMT_ABYSS) {
          if (m_penView!=NULL) {
            ((CPlayerView*)&*m_penView)->m_bFixed = TRUE;
          }
        }
        // if should blow up now (and not already blown up)
        if (ShouldBlowUp()) {
          // do it
          BlowUp();
        }
        resume; 
      }
      on (EDeath) : { resume; }
      // if player pressed fire
      on (EEnd) : { 
        // NOTE: predictors must never respawn since player markers for respawning are not predicted
        // if this is not predictor
        if (!IsPredictor()) { 
          // stop waiting
          stop; 
        } 
      }
      // if autoaction is received
      on (EAutoAction eAutoAction) : {
        // if we are in coop
        if (GetSP()->sp_bCooperative && !GetSP()->sp_bSinglePlayer) {
          // if the marker is teleport marker
          if (eAutoAction.penFirstMarker!=NULL && 
            ((CPlayerActionMarker*)&*eAutoAction.penFirstMarker)->m_paaAction == PAA_TELEPORT) {
            // teleport there
            TeleportToAutoMarker((CPlayerActionMarker*)&*eAutoAction.penFirstMarker);
          }
        }
        // ignore the actions
        resume;
      }
      on (EDisconnected) : { pass; }
      on (EReceiveScore) : { pass; }
      on (EKilledEnemy) : { pass; }
      on (EPreLevelChange) : { pass; }
      on (EPostLevelChange) : { pass; }
      otherwise() : { resume; }
    }

    return ERebirth();
  };

  TheEnd() {
    // if not playing demo
    if (!_pNetwork->IsPlayingDemo()) {
      // record high score in single player only
      if (GetSP()->sp_bSinglePlayer) {
        _pShell->Execute("gam_iRecordHighScore=0;");
      }
    }
    // if current difficulty is serious
    if (GetSP()->sp_gdGameDifficulty==CSessionProperties::GD_EXTREME) {
      // activate the mental mode
      _pShell->Execute("sam_bMentalActivated=1;");
    }

    // stop firing when end
    ((CPlayerWeapons&)*m_penWeapons).SendEvent(EReleaseWeapon());

    // mark player as dead
    SetFlags(GetFlags()&~ENF_ALIVE);
    // stop player
    SetDesiredTranslation(FLOAT3D(0.0f, 0.0f, 0.0f));
    SetDesiredRotation(ANGLE3D(0.0f, 0.0f, 0.0f));

    // look straight
    StartModelAnim(PLAYER_ANIM_STAND, 0);
    ((CPlayerAnimator&)*m_penAnimator).BodyAnimationTemplate(
      BODY_ANIM_NORMALWALK, BODY_ANIM_COLT_STAND, BODY_ANIM_SHOTGUN_STAND, BODY_ANIM_MINIGUN_STAND, 
      AOF_LOOPING|AOF_NORESTART);

    en_plViewpoint.pl_OrientationAngle = ANGLE3D(0,0,0);

    // call computer
    m_bEndOfGame = TRUE;
    SetGameEnd();

    wait () {
      on (EBegin) : { resume; }
      on (EReceiveScore) : { pass; }
      on (EKilledEnemy) : { pass; }
      on (ECenterMessage) : { pass; }
      otherwise() : { resume; }
    }
  };

/************************************************************
 *                      R E B I R T H                       *
 ************************************************************/
  FirstInit() {

    if (GetSP()->sp_fStartMaxShield>0.0f && GetSP()->sp_bSinglePlayer==FALSE) {
      m_fMaxShield=(GetSP()->sp_fStartMaxShield);
    }

    InitAniNum();
    // clear use button and zoom flag
    bUseButtonHeld = FALSE;
    
    // restore last view
    m_iViewState = m_iLastViewState;

    // stop and kill camera
    if (m_penView != NULL) {
      ((CPlayerView&)*m_penView).SendEvent(EEnd());
      m_penView = NULL;
    }

    FindMusicHolder();
	CheckShopInTheWorld();

    // update per-level stats
    UpdateLevelStats();

    // initialize player (from PlayerMarker)
    InitializePlayer();

	// add statistics message
    ReceiveComputerMessage(CTFILENAME("Data\\Messages\\Statistics\\Statistics.txt"), CMF_READ);

	  SetHUD();


    if (GetSettings()->ps_ulFlags&PSF_PREFER3RDPERSON) {
		ChangePlayerView();
    }
	FLOAT fTime = GetSP()->sp_fForceSpectateCD;
	CMusicHolder *pmh = (CMusicHolder *)m_penMainMusicHolder.ep_pen;
	if (GetSP()->sp_bCooperative && !GetSP()->sp_bSinglePlayer) {
		if (_pTimer->CurrentTick()>pmh->m_fLevelTime+fTime && GetSP()->sp_ctCreditsLeft>0) {
			((CSessionProperties*)GetSP())->sp_ctCreditsLeft--;
		} else if (_pTimer->CurrentTick()>pmh->m_fLevelTime+fTime && GetSP()->sp_ctCreditsLeft==0) {
			ForceSpectate();
		}
	}
    return;
  };

  Rebirth() {
    
    bUseButtonHeld = FALSE;
	

    // restore last view
    m_iViewState = m_iLastViewState;
    // clear ammunition
    if (!(m_ulFlags&PLF_RESPAWNINPLACE)) {
      GetPlayerWeapons()->ClearWeapons();
    }

    // stop and kill camera
    if (m_penView != NULL) {
      ((CPlayerView&)*m_penView).SendEvent(EEnd());
      m_penView = NULL;
    }

    // stop and kill flame
    CEntityPointer penFlame = GetChildOfClass("Flame");
    if (penFlame!=NULL)
    {
      // send the event to stop burning
      EStopFlaming esf;
      esf.m_bNow=TRUE;
      penFlame->SendEvent(esf);
    }
	
	if (m_penView != NULL) {
      ((CPlayerView&)*m_penView).SendEvent(EEnd());
      m_penView = NULL;
    }

	m_penSpectatorPlayer=NULL;
	m_iSpectatorPlayerIndex=-1;

    FindMusicHolder();
	
	INDEX iMoneyBefore=m_iMoney;
	if (m_iMoney>0) {
		m_iMoney = (INDEX)(m_iMoney*0.8f); // remove 20% of money after respawn
		INDEX iPenalty=iMoneyBefore-m_iMoney;
		CTString str(0, TRANS("Respawn penalty: %i$"), iPenalty);
		PrintCenterMessage(this, this, str, 5.0f, MSS_NONE);
	}
	CheckShopInTheWorld();

    // initialize player (from PlayerMarker)
    InitializePlayer();

    return EReturn();
  };


  // auto action - go to current marker
  AutoGoToMarker(EVoid)
  {
    ULONG ulFlags = AOF_LOOPING|AOF_NORESTART;

    INDEX iAnim = GetModelObject()->GetAnim();
    if( iAnim!=PLAYER_ANIM_STAND)
    {
      ulFlags |= AOF_SMOOTHCHANGE;
    }

    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;
    plan.m_bAttacking = FALSE;
    plan.BodyWalkAnimation();
    if (m_fAutoSpeed>plr_fSpeedForward/2) {
      StartModelAnim(PLAYER_ANIM_RUN, ulFlags);
    } else {
      StartModelAnim(PLAYER_ANIM_NORMALWALK, ulFlags);
    }

    // while not at marker
    while (
      (m_penActionMarker->GetPlacement().pl_PositionVector-
       GetPlacement().pl_PositionVector).Length()>1.0f) {
      // wait a bit
      autowait(_pTimer->TickQuantum);
    }

    // return to auto-action loop
    return EReturn();
  }

  // auto action - go to current marker and stop there
  AutoGoToMarkerAndStop(EVoid)
  {
    ULONG ulFlags = AOF_LOOPING|AOF_NORESTART;

    INDEX iAnim = GetModelObject()->GetAnim();
    if( iAnim!=PLAYER_ANIM_STAND)
    {
      ulFlags |= AOF_SMOOTHCHANGE;
    }

    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;
    plan.BodyWalkAnimation();
    if (m_fAutoSpeed>plr_fSpeedForward/2) {
      StartModelAnim(PLAYER_ANIM_RUN, ulFlags);
    } else {
      StartModelAnim(PLAYER_ANIM_NORMALWALK, ulFlags);
    }

    // while not at marker
    while (
      (m_penActionMarker->GetPlacement().pl_PositionVector-
       GetPlacement().pl_PositionVector).Length()>m_fAutoSpeed*_pTimer->TickQuantum*2.00f) {
      // wait a bit
      autowait(_pTimer->TickQuantum);
    }
    // disable auto speed
    m_fAutoSpeed = 0.0f;

    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;
    plan.BodyStillAnimation();
    StartModelAnim(PLAYER_ANIM_STAND, AOF_LOOPING|AOF_NORESTART);

    // stop moving
    ForceFullStop();

    // return to auto-action loop
    return EReturn();
  }

  // auto action - use an item
  AutoUseItem(EVoid)
  {

    // start pulling the item
    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;
    plan.BodyPullItemAnimation();
    //StartModelAnim(PLAYER_ANIM_STATUE_PULL, 0);

    autowait(0.2f);

    // item appears
    CPlayerActionMarker *ppam = GetActionMarker();
    if (IsOfClass(ppam->m_penItem, "KeyItem")) {
      CModelObject &moItem = ppam->m_penItem->GetModelObject()->GetAttachmentModel(0)->amo_moModelObject;
      GetPlayerAnimator()->SetItem(&moItem);
    }

    autowait(2.20f-0.2f);

    // the item is in place
    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;
    plan.BodyRemoveItem();
    // if marker points to a trigger
    if (GetActionMarker()->m_penTrigger!=NULL) {
      // trigger it
      SendToTarget(GetActionMarker()->m_penTrigger, EET_TRIGGER, this);
    }

    // fake that player has passed through the door controller
    if (GetActionMarker()->m_penDoorController!=NULL) {
      EPass ePass;
      ePass.penOther = this;
      GetActionMarker()->m_penDoorController->SendEvent(ePass);
    }
    
    autowait(3.25f-2.20f);

    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;
    plan.BodyRemoveItem();

    // return to auto-action loop
    return EReturn();
  }

  // auto action - pick an item
  AutoPickItem(EVoid)
  {

    // start pulling the item
    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;
    plan.BodyPickItemAnimation();
    StartModelAnim(PLAYER_ANIM_KEYLIFT, 0);

    autowait(1.2f);

    // if marker points to a trigger
    if (GetActionMarker()->m_penTrigger!=NULL) {
      // trigger it
      SendToTarget(GetActionMarker()->m_penTrigger, EET_TRIGGER, this);
    }

    // item appears
    CPlayerActionMarker *ppam = GetActionMarker();
    if (IsOfClass(ppam->m_penItem, "KeyItem")) {
      CModelObject &moItem = ppam->m_penItem->GetModelObject()->GetAttachmentModel(0)->amo_moModelObject;
      GetPlayerAnimator()->SetItem(&moItem);
      EPass ePass;
      ePass.penOther = this;
      ppam->m_penItem->SendEvent(ePass);
    }

    autowait(3.6f-1.2f+GetActionMarker()->m_tmWait);

    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;
    plan.BodyRemoveItem();

    // return to auto-action loop
    return EReturn();
  }

  AutoFallDown(EVoid)
  {
    StartModelAnim(PLAYER_ANIM_BRIDGEFALLPOSE, 0);
    CModelObject &moBody = GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
    moBody.PlayAnim(BODY_ANIM_BRIDGEFALLPOSE, 0);

    autowait(GetActionMarker()->m_tmWait);

    // return to auto-action loop
    return EReturn();
  }

  AutoFallToAbys(EVoid)
  {
    StartModelAnim(PLAYER_ANIM_ABYSSFALL, AOF_LOOPING);
    CModelObject &moBody = GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
    moBody.PlayAnim(BODY_ANIM_ABYSSFALL, AOF_LOOPING);

    autowait(GetActionMarker()->m_tmWait);

    // return to auto-action loop
    return EReturn();
  }

  // auto action - look around
  AutoLookAround(EVoid)
  {
    StartModelAnim(PLAYER_ANIM_BACKPEDAL, 0);
    m_vAutoSpeed = FLOAT3D(0,0,plr_fSpeedForward/4/0.75f);
    CModelObject &moBody = GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
    moBody.PlayAnim(BODY_ANIM_NORMALWALK, 0);

    autowait(GetModelObject()->GetCurrentAnimLength()/2);

    m_vAutoSpeed = FLOAT3D(0,0,0);
 
    // start looking around
    StartModelAnim(PLAYER_ANIM_STAND, 0);
    CModelObject &moBody = GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
    moBody.PlayAnim(BODY_ANIM_LOOKAROUND, 0);
    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;

    // wait given time
    autowait(moBody.GetCurrentAnimLength()+0.1f);

    // return to auto-action loop
    return EReturn();
  }

  AutoTeleport(EVoid)
  {
    // teleport there
    TeleportToAutoMarker(GetActionMarker());

    // return to auto-action loop
    return EReturn();
  }

  AutoAppear(EVoid)
  {
    // hide the model
    SwitchToEditorModel();

    // put it at marker
    Teleport(GetActionMarker()->GetPlacement());
    // make it rotate in spawnpose
    SetPhysicsFlags(GetPhysicsFlags() & ~(EPF_TRANSLATEDBYGRAVITY|EPF_ORIENTEDBYGRAVITY));
    m_ulFlags|=PLF_AUTOMOVEMENTS;
    SetDesiredRotation(ANGLE3D(60,0,0));
    StartModelAnim(PLAYER_ANIM_SPAWNPOSE, AOF_LOOPING);
    CModelObject &moBody = GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
    moBody.PlayAnim(BODY_ANIM_SPAWNPOSE, AOF_LOOPING);

    // start stardust appearing
    m_tmSpiritStart = _pTimer->CurrentTick();
    // wait till it appears
    autowait(5);

    // start model appearing
    SwitchToModel();
    m_tmFadeStart = _pTimer->CurrentTick();
    // wait till it appears
    autowait(5);
    // fixate full opacity
    COLOR colAlpha = GetModelObject()->mo_colBlendColor;
    GetModelObject()->mo_colBlendColor = colAlpha|0xFF;

    // put it to normal state
    SetPhysicsFlags(GetPhysicsFlags() | EPF_TRANSLATEDBYGRAVITY|EPF_ORIENTEDBYGRAVITY);
    SetDesiredRotation(ANGLE3D(0,0,0));
    m_ulFlags&=~PLF_AUTOMOVEMENTS;

    // play animation to fall down
    StartModelAnim(PLAYER_ANIM_SPAWN_FALLDOWN, 0);
    CModelObject &moBody = GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
    moBody.PlayAnim(BODY_ANIM_SPAWN_FALLDOWN, 0);

    autowait(GetModelObject()->GetCurrentAnimLength());

    // play animation to get up
    StartModelAnim(PLAYER_ANIM_SPAWN_GETUP, AOF_SMOOTHCHANGE);
    CModelObject &moBody = GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
    moBody.PlayAnim(BODY_ANIM_SPAWN_GETUP, AOF_SMOOTHCHANGE);

    autowait(GetModelObject()->GetCurrentAnimLength());

    // return to auto-action loop
    return EReturn();
  }

  TravellingInBeam()
  {
    // put it at marker
    Teleport(GetActionMarker()->GetPlacement());
    // make it rotate in spawnpose
    SetPhysicsFlags(GetPhysicsFlags() & ~(EPF_TRANSLATEDBYGRAVITY|EPF_ORIENTEDBYGRAVITY));
    m_ulFlags|=PLF_AUTOMOVEMENTS;
    SetDesiredRotation(ANGLE3D(60,0,0));
    SetDesiredTranslation(ANGLE3D(0,20.0f,0));
    StartModelAnim(PLAYER_ANIM_SPAWNPOSE, AOF_LOOPING);
    CModelObject &moBody = GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
    moBody.PlayAnim(BODY_ANIM_SPAWNPOSE, AOF_LOOPING);
    // wait till it appears
    autowait(8.0f);
    // switch to model
    SwitchToEditorModel();
    // return to auto-action loop
    return EReturn();
  }
  
  LogoFireMinigun(EVoid) 
  {
    // put it at marker
    CPlacement3D pl = GetActionMarker()->GetPlacement();
    pl.pl_PositionVector += FLOAT3D(0, 0.01f, 0)*GetActionMarker()->en_mRotation;
    Teleport(pl);
    en_plViewpoint.pl_OrientationAngle(1) = 20.0f;
    en_plLastViewpoint.pl_OrientationAngle = en_plViewpoint.pl_OrientationAngle;

    // stand in pose
    StartModelAnim(PLAYER_ANIM_INTRO, AOF_LOOPING);
    // remember time for rotating view start
    m_tmMinigunAutoFireStart = _pTimer->CurrentTick();
    // wait some time for fade in and to look from left to right with out firing
    //autowait(0.75f);
    ((CPlayerWeapons&)*m_penWeapons).SendEvent(EFireWeapon());
    autowait(2.5f);
    ((CPlayerWeapons&)*m_penWeapons).SendEvent(EReleaseWeapon());

    // stop minigun shaking
    CModelObject &moBody = GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
    moBody.PlayAnim(BODY_ANIM_MINIGUN_STAND, 0);

    autowait(0.5f);

    // ---------- Apply shake
    CWorldSettingsController *pwsc = NULL;
    // obtain bcg viewer
    CBackgroundViewer *penBcgViewer = (CBackgroundViewer *) GetWorld()->GetBackgroundViewer();
    if( penBcgViewer != NULL)
    {
      pwsc = (CWorldSettingsController *) &*penBcgViewer->m_penWorldSettingsController;
      pwsc->m_tmShakeStarted = _pTimer->CurrentTick();
      pwsc->m_vShakePos = GetPlacement().pl_PositionVector;
      pwsc->m_fShakeFalloff = 250.0f;
      pwsc->m_fShakeFade = 3.0f;

      pwsc->m_fShakeIntensityZ = 0.1f*2.0f;
      pwsc->m_tmShakeFrequencyZ = 5.0f;
      pwsc->m_fShakeIntensityY = 0.0f;
      pwsc->m_fShakeIntensityB = 0.0f;

      pwsc->m_bShakeFadeIn = FALSE;

      /*
      pwsc->m_fShakeIntensityY = 0.1f*2.0f;
      pwsc->m_tmShakeFrequencyY = 5.0f;
      pwsc->m_fShakeIntensityB = 2.5f*1.5f;
      pwsc->m_tmShakeFrequencyB = 7.2f;
      */
    }

    // stop rotating body
    m_tmMinigunAutoFireStart = -1;
    autowait(5.0f);
    IFeel_StopEffect(NULL);
    autowait(5.0f);

    return EReturn();
  }

  AutoStoreWeapon(EVoid) 
  {
    // store current weapon slowly
    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;
    plan.BodyAnimationTemplate(BODY_ANIM_WAIT, 
      BODY_ANIM_COLT_REDRAWSLOW, BODY_ANIM_SHOTGUN_REDRAWSLOW, BODY_ANIM_MINIGUN_REDRAWSLOW, 
      0);
    autowait(plan.m_fBodyAnimTime);

    m_iAutoOrgWeapon = ((CPlayerWeapons&)*m_penWeapons).m_iCurrentWeapon;  
    ((CPlayerWeapons&)*m_penWeapons).m_iCurrentWeapon = WEAPON_NONE;
    ((CPlayerWeapons&)*m_penWeapons).m_iWantedWeapon = WEAPON_NONE;
    m_soWeaponAmbient.Stop();

    // sync apperances
    GetPlayerAnimator()->SyncWeapon();
    // remove weapon attachment
    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;
    plan.m_iWeaponLast = m_iAutoOrgWeapon;
    plan.RemoveWeapon();
    GetPlayerAnimator()->SyncWeapon();

    ((CPlayerWeapons&)*m_penWeapons).m_iCurrentWeapon = (WeaponType) m_iAutoOrgWeapon;
    plan.BodyAnimationTemplate(BODY_ANIM_WAIT, BODY_ANIM_COLT_DEACTIVATETOWALK,
      BODY_ANIM_SHOTGUN_DEACTIVATETOWALK, BODY_ANIM_MINIGUN_DEACTIVATETOWALK, AOF_SMOOTHCHANGE);
    ((CPlayerWeapons&)*m_penWeapons).m_iCurrentWeapon = WEAPON_NONE;

    autowait(plan.m_fBodyAnimTime);

    // return to auto-action loop
    return EReturn();
  }

  // perform player auto actions
  DoAutoActions(EVoid)
  {
    // don't look up/down
    en_plViewpoint.pl_OrientationAngle = ANGLE3D(0,0,0);
    // disable playeranimator animating
    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;
    plan.m_bDisableAnimating = TRUE;

    // while there is some marker
    while (m_penActionMarker!=NULL && IsOfClass(m_penActionMarker, "PlayerActionMarker")) {

      // if should wait
      if (GetActionMarker()->m_paaAction==PAA_WAIT) {
        // play still anim
        CModelObject &moBody = GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
        moBody.PlayAnim(BODY_ANIM_WAIT, AOF_NORESTART|AOF_LOOPING);
        // wait given time
        autowait(GetActionMarker()->m_tmWait);
      } else if (GetActionMarker()->m_paaAction==PAA_STOPANDWAIT) {
        // play still anim
        StartModelAnim(PLAYER_ANIM_STAND, 0);
        CModelObject &moBody = GetModelObject()->GetAttachmentModel(PLAYER_ATTACHMENT_TORSO)->amo_moModelObject;
        moBody.PlayAnim(BODY_ANIM_WAIT, AOF_NORESTART|AOF_LOOPING);
        // wait given time
        autowait(GetActionMarker()->m_tmWait);

      // if should teleport here
      } else if (GetActionMarker()->m_paaAction==PAA_APPEARING) {
        autocall AutoAppear() EReturn;
      } else if (GetActionMarker()->m_paaAction==PAA_TRAVELING_IN_BEAM) {
        autocall TravellingInBeam() EReturn;
      } else if (GetActionMarker()->m_paaAction==PAA_INTROSE_SELECT_WEAPON) {
        // order playerweapons to select weapon
        ESelectWeapon eSelect;
        eSelect.iWeapon = 1;
        ((CPlayerWeapons&)*m_penWeapons).SendEvent(eSelect);
      } else if (GetActionMarker()->m_paaAction==PAA_LOGO_FIRE_INTROSE) {
        autocall LogoFireMinigun() EReturn;
      } else if (GetActionMarker()->m_paaAction==PAA_LOGO_FIRE_MINIGUN) {
        autocall LogoFireMinigun() EReturn;
      // if should appear here
      } else if (GetActionMarker()->m_paaAction==PAA_TELEPORT) {
        autocall AutoTeleport() EReturn;

      // if should wait for trigger
      } else if (GetActionMarker()->m_paaAction==PAA_WAITFOREVER) {
        // wait forever
        wait() {
          on (EBegin) : { resume; }
          otherwise() : { pass; }
        }
      // if should store weapon
      } else if (GetActionMarker()->m_paaAction==PAA_STOREWEAPON) {
        autocall AutoStoreWeapon() EReturn;
      
      // if should draw weapon
      } else if (GetActionMarker()->m_paaAction==PAA_DRAWWEAPON) {
        // order playerweapons to select best weapon
        ESelectWeapon eSelect;
        eSelect.iWeapon = -4;
        ((CPlayerWeapons&)*m_penWeapons).SendEvent(eSelect);

      // if should wait
      } else if (GetActionMarker()->m_paaAction==PAA_LOOKAROUND) {
        autocall AutoLookAround() EReturn;

      // if should use item
      } else if (GetActionMarker()->m_paaAction==PAA_USEITEM) {
        // use it
        autocall AutoUseItem() EReturn;

      // if should pick item
      } else if (GetActionMarker()->m_paaAction==PAA_PICKITEM) {
        // pick it
        autocall AutoPickItem() EReturn;

      // if falling from bridge
      } else if (GetActionMarker()->m_paaAction==PAA_FALLDOWN) {
        // fall
        autocall AutoFallDown() EReturn;

      // if releasing player
      } else if (GetActionMarker()->m_paaAction==PAA_RELEASEPLAYER) {
        if (m_penCamera!=NULL) {
          ((CCamera*)&*m_penCamera)->m_bStopMoving=TRUE;
        }
        m_penCamera = NULL;
        // if currently not having any weapon in hand
        if (GetPlayerWeapons()->m_iCurrentWeapon == WEAPON_NONE) {
          // order playerweapons to select best weapon
          ESelectWeapon eSelect;
          eSelect.iWeapon = -4;
          ((CPlayerWeapons&)*m_penWeapons).SendEvent(eSelect);
        }
        // sync weapon, just in case
        m_ulFlags |= PLF_SYNCWEAPON;
        m_tmSpiritStart = 0;

      // if start computer
      } else if (GetActionMarker()->m_paaAction==PAA_STARTCOMPUTER) {
        // mark that
        if (_pNetwork->IsPlayerLocal(this) && GetSP()->sp_bSinglePlayer) {
          cmp_ppenPlayer = this;
          cmp_bInitialStart = TRUE;
        }

      // if start introscroll
      } else if (GetActionMarker()->m_paaAction==PAA_STARTINTROSCROLL) {
        _pShell->Execute("sam_iStartCredits=1;");

      // if start credits
      } else if (GetActionMarker()->m_paaAction==PAA_STARTCREDITS) {
        _pShell->Execute("sam_iStartCredits=2;");

      // if stop scroller
      } else if (GetActionMarker()->m_paaAction==PAA_STOPSCROLLER) {
        _pShell->Execute("sam_iStartCredits=-1;");

      // if should run to the marker
      } else if (GetActionMarker()->m_paaAction==PAA_RUN) {
        // go to it
        m_fAutoSpeed = plr_fSpeedForward*GetActionMarker()->m_fSpeed;                                             
        autocall AutoGoToMarker() EReturn;

      // if should run to the marker and stop exactly there
      } else if (GetActionMarker()->m_paaAction==PAA_RUNANDSTOP) {
        // go to it
        m_fAutoSpeed = plr_fSpeedForward*GetActionMarker()->m_fSpeed;                                             
        autocall AutoGoToMarkerAndStop() EReturn;

      // if should record end-of-level stats
      } else if (GetActionMarker()->m_paaAction==PAA_RECORDSTATS) {

        if (GetSP()->sp_bSinglePlayer || GetSP()->sp_bPlayEntireGame) {
          // remeber estimated time
          m_tmEstTime = GetActionMarker()->m_tmWait;
          // record stats
          RecordEndOfLevelData();
        } else {
          SetGameEnd();
        }

      // if should show statistics to the player
      } else if (GetActionMarker()->m_paaAction==PAA_SHOWSTATS) {
        // call computer
        if (cmp_ppenPlayer==NULL && _pNetwork->IsPlayerLocal(this) && GetSP()->sp_bSinglePlayer) {
          m_bEndOfLevel = TRUE;
          cmp_ppenPlayer = this;
          m_ulFlags|=PLF_DONTRENDER;
          while(m_bEndOfLevel) {
            wait(_pTimer->TickQuantum) {
              on (ETimer) : { stop; }
              on (EReceiveScore) : { pass; }
              on (EKilledEnemy) : { pass; }
              on (ECenterMessage) : { pass; }
              on (EPostLevelChange) : { 
                m_ulFlags&=!PLF_DONTRENDER;
                m_bEndOfLevel = FALSE;
                pass; 
              }
              otherwise() : { resume; }
            }
          }
          m_ulFlags&=!PLF_DONTRENDER;
        }
      // if end of entire game
      } else if (GetActionMarker()->m_paaAction==PAA_ENDOFGAME) {

        // record stats
        jump TheEnd();
      } else if (GetActionMarker()->m_paaAction==PAA_NOGRAVITY) {
        SetPhysicsFlags(GetPhysicsFlags() & ~(EPF_TRANSLATEDBYGRAVITY|EPF_ORIENTEDBYGRAVITY));
        if( GetActionMarker()->GetParent() != NULL)
        {
          SetParent(GetActionMarker()->GetParent());
        }
      } else if (GetActionMarker()->m_paaAction==PAA_TURNONGRAVITY) {
        SetPhysicsFlags(GetPhysicsFlags()|EPF_TRANSLATEDBYGRAVITY|EPF_ORIENTEDBYGRAVITY);
        SetParent(NULL);
      }
      else if (TRUE) {
        ASSERT(FALSE);
      }

      // if marker points to a trigger
      if (GetActionMarker()->m_penTrigger!=NULL &&
          GetActionMarker()->m_paaAction!=PAA_PICKITEM) {
        // trigger it
        SendToTarget(GetActionMarker()->m_penTrigger, EET_TRIGGER, this);
      }

      // get next marker
      m_penActionMarker = GetActionMarker()->m_penTarget;
    }
    
    // disable auto speed
    m_fAutoSpeed = 0.0f;

    // must clear marker, in case it was invalid
    m_penActionMarker = NULL;

    // enable playeranimator animating
    CPlayerAnimator &plan = (CPlayerAnimator&)*m_penAnimator;
    plan.m_bDisableAnimating = FALSE;

    // return to main loop
    return EVoid();
  }
/************************************************************
 *                        M  A  I  N                        *
 ************************************************************/
  Main(EVoid evoid)
  {
	m_penSpectatorPlayer=NULL;                               //  * SPECTATOR *****************************************
	m_iSpectatorPlayerIndex=-1;
    // remember start time
    time(&m_iStartTime);

    m_ctUnreadMessages = 0;
	m_bShopInTheWorld=FALSE;

	SetFlags(GetFlags()|ENF_CROSSESLEVELS|ENF_NOTIFYLEVELCHANGE);
    InitAsEditorModel();

    // set default model for physics etc
    CTString strDummy;
    SetPlayerAppearance(GetModelObject(), NULL, strDummy, /*bPreview=*/FALSE);
    // set your real appearance if possible
    ValidateCharacter();
    SetPlayerAppearance(&m_moRender, &en_pcCharacter, strDummy, /*bPreview=*/FALSE);
    ParseGender(strDummy);

    // if unsuccessful
    if (GetModelObject()->GetData()==NULL) {
      // never proceed with initialization - player cannot work
      return;
    }

    //const FLOAT fSize = 2.1f/1.85f;
    //GetModelObject()->StretchModel(FLOAT3D(fSize, fSize, fSize));
    ModelChangeNotify();

    // wait a bit to allow other entities to start
    wait(0.2f) { // this is 4 ticks, it has to be at least more than musicchanger for enemy counting
      on (EBegin) : { resume; }
      on (ETimer) : { stop; }
      on (EDisconnected) : { 
        Destroy(); 
        return;
      }
    }

    // do not use predictor if not yet initialized
    if (IsPredictor()) { // !!!!####
      Destroy();
      return;
    }

    // appear
    SwitchToModel();
    m_ulFlags|=PLF_INITIALIZED;

    // set initial vars
    en_tmMaxHoldBreath = 60.0f;
    en_fDensity = 1000.0f;    // same density as water - to be able to dive freely

    ModelChangeNotify();

    // spawn weapons
    m_penWeapons = CreateEntity(GetPlacement(), CLASS_PLAYER_WEAPONS);
    EWeaponsInit eInitWeapons;
    eInitWeapons.penOwner = this;
    m_penWeapons->Initialize(eInitWeapons);

    // spawn animator
    m_penAnimator = CreateEntity(GetPlacement(), CLASS_PLAYER_ANIMATOR);
    EAnimatorInit eInitAnimator;
    eInitAnimator.penPlayer = this;
    m_penAnimator->Initialize(eInitAnimator);

    // set sound default parameters
    m_soMouth.Set3DParameters(50.0f, 10.0f, 1.0f, 1.0f);
    m_soFootL.Set3DParameters(20.0f, 2.0f, 1.0f, 1.0f);
    m_soFootR.Set3DParameters(20.0f, 2.0f, 1.0f, 1.0f);
    m_soBody.Set3DParameters(25.0f, 5.0f, 1.0f, 1.0f);
    m_soMessage.Set3DParameters(25.0f, 5.0f, 1.0f, 1.0f);
    m_soSniperZoom.Set3DParameters(25.0f, 5.0f, 1.0f, 1.0f);
      
    // setup light source
    SetupLightSource();

    // set light animation if available
    try {
      m_aoLightAnimation.SetData_t(CTFILENAME("Animations\\BasicEffects.ani"));
    } catch (char *strError) {
      WarningMessage(TRANS("Cannot load Animations\\BasicEffects.ani: %s"), strError);
    }
    PlayLightAnim(LIGHT_ANIM_NONE, 0);

    wait() {
      on (EBegin) : { call FirstInit(); }
      on (ERebirth) : { call Rebirth(); }
      on (EDeath eDeath) : { call Death(eDeath); }
      on (EDamage eDamage) : { call Wounded(eDamage); }
      on (EPreLevelChange) : { 

        if (GetSP()->sp_bGiveExtraShield && GetSP()->sp_gmGameMode==CSessionProperties::GM_SURVIVALCOOP) { // * H3D - Convert left respawn credits to MaxShield
          EMaxShield eMaxShield;
          FLOAT fCreditsLeft;
          fCreditsLeft=GetSP()->sp_ctCreditsLeft;
          eMaxShield.fMaxShield=(eMaxShield.fMaxShield)+fCreditsLeft;
          ReceiveItem(eMaxShield);
        }                                                                                             //

        m_ulFlags&=~PLF_INITIALIZED; 
        m_ulFlags|=PLF_CHANGINGLEVEL;
        m_ulFlags &= ~PLF_LEVELSTARTED;
        resume; 
      }
      on (EPostLevelChange) : {
        if (GetSP()->sp_gmGameMode==CSessionProperties::GM_SURVIVALCOOP) {    // * H3D - Reset sp_ctCreditsLeft
          ((CSessionProperties*)GetSP())->sp_ctCreditsLeft=1;
        }
        if (GetSP()->sp_bSinglePlayer || (GetFlags()&ENF_ALIVE)) {
          call WorldChange(); 
        } else {
          call WorldChangeDead(); 
        }
      }
      on (ETakingBreath eTakingBreath ) : {
        SetDefaultMouthPitch();
        if (eTakingBreath.fBreathDelay<0.2f) {
          PlaySound(m_soMouth, GenderSound(SOUND_INHALE0), SOF_3D);
        } else if (eTakingBreath.fBreathDelay<0.8f) {
          PlaySound(m_soMouth, GenderSound(SOUND_INHALE1), SOF_3D);
        } else {
          PlaySound(m_soMouth, GenderSound(SOUND_INHALE2), SOF_3D);
        }
        resume;
      }

      on (EShopEntered eShopEntered) : {
        m_penShop = eShopEntered.penShop;
        m_iSelectedShopIndex = 0;
        resume;
      }

      on (ECameraStart eStart) : {
        m_penCamera = eStart.penCamera;

        // stop player
        if (m_penActionMarker==NULL) {
          SetDesiredTranslation(FLOAT3D(0.0f, 0.0f, 0.0f));
          SetDesiredRotation(ANGLE3D(0.0f, 0.0f, 0.0f));
        }
        // stop firing
        ((CPlayerWeapons&)*m_penWeapons).SendEvent(EReleaseWeapon());
        m_penAnimator->SendEvent(EStop());
        resume;
      }
      on (ECameraStop eCameraStop) : {
        if (m_penCamera==eCameraStop.penCamera) {
          m_penCamera = NULL;
        }
        resume;
      }
      on (ECenterMessage eMsg) : {
        m_strCenterMessage = eMsg.strMessage;
        m_tmCenterMessageEnd = _pTimer->CurrentTick()+eMsg.tmLength;
        if (eMsg.mssSound==MSS_INFO) {
          m_soMessage.Set3DParameters(25.0f, 5.0f, 1.0f, 1.0f);
          PlaySound(m_soMessage, SOUND_INFO, SOF_3D|SOF_VOLUMETRIC|SOF_LOCAL);
        }
        resume;
      }
      on (EComputerMessage eMsg) : {
        ReceiveComputerMessage(eMsg.fnmMessage, CMF_ANALYZE);
        resume;
      }
      on (EVoiceMessage eMsg) : {
        SayVoiceMessage(eMsg.fnmMessage);
        resume;
      }
      on (EAutoAction eAutoAction) : {
        // remember first marker
        m_penActionMarker = eAutoAction.penFirstMarker;
        // do the actions
        call DoAutoActions();
      }
      on (EReceiveScore eScore) : {
        m_psLevelStats.ps_iScore += eScore.iPoints;
        m_psGameStats.ps_iScore += eScore.iPoints;
        m_iMana  += eScore.iPoints*GetSP()->sp_fManaTransferFactor;
        // m_iMoney += eScore.iPoints;
        CheckHighScore();
		if (m_penMainMusicHolder!=NULL && GetSP()->sp_ctCredits!=-1) {
			m_penMainMusicHolder->SendEvent(eScore);
		}
        resume;
      }
      on (EKilledEnemy) : {
        m_psLevelStats.ps_iKills += 1;
        m_psGameStats.ps_iKills += 1;
        resume;
      }
      on (ESecretFound) : {
        m_psLevelStats.ps_iSecrets += 1;
        m_psGameStats.ps_iSecrets += 1;
        resume;
      }
      on (EWeaponChanged) : {
        // make sure we discontinue zooming (even if not changing from sniper)
        ((CPlayerWeapons&)*m_penWeapons).m_bSniping=FALSE;
        m_ulFlags&=~PLF_ISZOOMING;
        PlaySound(m_soSniperZoom, SOUND_SILENCE, SOF_3D);        
        if(_pNetwork->IsPlayerLocal(this)) {IFeel_StopEffect("SniperZoom");}
        resume;
      }
      // EEnd should not arrive here
      on (EEnd) : {
        ASSERT(FALSE);
        resume;
      }
      // if player is disconnected
      on (EDisconnected) : {
        // exit the loop
        stop;
      }
      // support for jumping using bouncers
      on (ETouch eTouch) : {
        if (IsOfClass(eTouch.penOther, "Bouncer")) {
          JumpFromBouncer(this, eTouch.penOther);
          // play jump sound
          SetDefaultMouthPitch();
          PlaySound(m_soMouth, GenderSound(SOUND_JUMP), SOF_3D);
          if(_pNetwork->IsPlayerLocal(this)) {IFeel_PlayEffect("Jump");}
        }
        resume;
      }
    }

    // we get here if the player is disconnected from the server

    // if we have some keys

      // find first live player
      CPlayer *penNextPlayer = NULL;
      for(INDEX iPlayer=0; iPlayer<GetMaxPlayers(); iPlayer++) {
        CPlayer *pen = (CPlayer*)&*GetPlayerEntity(iPlayer);
        if (pen!=NULL && pen!=this && (pen->GetFlags()&ENF_ALIVE) && !(pen->GetFlags()&ENF_DELETED) ) {
			if (!IsPredictor() && m_ulKeys!=0) {
				penNextPlayer = pen;
			}
		}
		if (pen!=NULL && pen!=this && ((CPlayer*)&*pen)->m_penSpectatorPlayer==this) {
			((CPlayer*)&*pen)->SwitchSpectatorPlayer();
		}
      }

      // if any found
      if (penNextPlayer!=NULL) {
        // transfer keys to that player
        CPrintF(TRANS("%s leaving, all keys transfered to %s\n"), 
          (const char*)m_strName, (const char*)penNextPlayer->GetPlayerName());
        penNextPlayer->m_ulKeys |= m_ulKeys;
      }

    // spawn teleport effect
    SpawnTeleport();

    // cease to exist
    m_penWeapons->Destroy();
    m_penAnimator->Destroy();
    if (m_penView!=NULL) {
      m_penView->Destroy();
    }
    if (m_pen3rdPersonView!=NULL) {
      m_pen3rdPersonView->Destroy();
    }
    Destroy();
    return;
  };
};

