
#include "StdH.h"
#include "GameMP/SEColors.h"

#include <Engine/Graphics/DrawPort.h>

#include <EntitiesMP/Player.h>
#include <EntitiesMP/PlayerWeapons.h>
#include <EntitiesMP/MusicHolder.h>
#include <EntitiesMP/EnemyBase.h>
#include <EntitiesMP/EnemyCounter.h>

#include <EntitiesMP/GameStat.h>

#define ENTITY_DEBUG

// armor & health constants 
// NOTE: these _do not_ reflect easy/tourist maxvalue adjustments. that is by design!
#define TOP_ARMOR  100
#define TOP_HEALTH 100


// cheats
extern INDEX cht_bEnable;
extern INDEX cht_bGod;
extern INDEX cht_bFly;
extern INDEX cht_bGhost;
extern INDEX cht_bInvisible;
extern FLOAT cht_fTranslationMultiplier;

// interface control
extern INDEX hud_bShowInfo;
extern INDEX hud_bShowLatency;
extern INDEX hud_bShowMessages;
extern INDEX hud_iShowPlayers;
extern INDEX hud_iSortPlayers;
extern FLOAT hud_fOpacity;
extern FLOAT hud_fScaling;
extern FLOAT hud_tmWeaponsOnScreen;
extern INDEX hud_bShowMatchInfo;

extern INDEX hud_iHUDColor;          // HUD 3D
extern INDEX hud_iShowPlayerList;    //

extern INDEX hud_iOldHUD;            //
extern FLOAT cht_fMaxShield;         //

// player statistics sorting keys
enum SortKeys {
  PSK_NAME    = 1,
  PSK_HEALTH  = 2,
  PSK_SCORE   = 3,
  PSK_MANA    = 4, 
  PSK_FRAGS   = 5,
  PSK_DEATHS  = 6,
};

// where is the bar lowest value
enum BarOrientations {
  BO_LEFT  = 1,
  BO_RIGHT = 2, 
  BO_UP    = 3,
  BO_DOWN  = 4,
};

extern const INDEX aiWeaponsRemap[19];

// maximal mana for master status
#define MANA_MASTER 10000

// drawing variables
static const CPlayer *_penPlayer;
static CPlayerWeapons *_penWeapons;
static CDrawPort *_pDP;
static PIX   _pixDPWidth, _pixDPHeight;
static FLOAT _fResolutionScaling;
static FLOAT _fCustomScaling;
static ULONG _ulAlphaHUD;
static COLOR _colHUD;
static COLOR _colHUDText;
static TIME  _tmNow = -1.0f;
static TIME  _tmLast = -1.0f;
static CFontData _fdNumbersFont;
static FLOAT _dioHUDScaling;
//static INDEX hud_iHUDColor = (INDEX)0x6CA0DB00;

// array for pointers of all players
extern CPlayer *_apenPlayers[NET_MAXGAMEPLAYERS] = {0};

// status bar textures
static CTextureObject _toHealth;
static CTextureObject _toOxygen;
static CTextureObject _toScore;
static CTextureObject _toHiScore;
static CTextureObject _toMessage;
static CTextureObject _toMana;
static CTextureObject _toFrags;
static CTextureObject _toDeaths;
static CTextureObject _toArmorSmall;
static CTextureObject _toArmorMedium;
static CTextureObject _toArmorLarge;

// ammo textures                    
static CTextureObject _toAShells;
static CTextureObject _toABullets;
static CTextureObject _toARockets;
static CTextureObject _toAGrenades;
static CTextureObject _toANapalm;
static CTextureObject _toAElectricity;
static CTextureObject _toAIronBall;
static CTextureObject _toASniperBullets;
static CTextureObject _toASeriousBomb;
// weapon textures
static CTextureObject _toWKnife;
static CTextureObject _toWColt;
static CTextureObject _toWSingleShotgun;
static CTextureObject _toWDoubleShotgun;
static CTextureObject _toWTommygun;
static CTextureObject _toWSniper;
static CTextureObject _toWChainsaw;
static CTextureObject _toWMinigun;
static CTextureObject _toWRocketLauncher;
static CTextureObject _toWGrenadeLauncher;
static CTextureObject _toWFlamer;
static CTextureObject _toWLaser;
static CTextureObject _toWIronCannon;

// powerup textures (ORDER IS THE SAME AS IN PLAYER.ES!)
#define MAX_POWERUPS 4
static CTextureObject _atoPowerups[MAX_POWERUPS];
// tile texture (one has corners, edges and center)
static CTextureObject _toTile;
// sniper mask texture
static CTextureObject _toSniperMask;
static CTextureObject _toSniperWheel;
static CTextureObject _toSniperArrow;
static CTextureObject _toSniperEye;
static CTextureObject _toSniperLed;

static CTextureObject _toPointer;        // HUD 3D
static CTextureObject _toCustomBP;       //
static CTextureObject _toSeriousBP;      //
static CTextureObject _toCustomBP32;     //
static CTextureObject _toSeriousBP32;    //

// all info about color transitions
struct ColorTransitionTable {
  COLOR ctt_colFine;      // color for values over 1.0
  COLOR ctt_colHigh;      // color for values from 1.0 to 'fMedium'
  COLOR ctt_colMedium;    // color for values from 'fMedium' to 'fLow'
  COLOR ctt_colLow;       // color for values under fLow
  FLOAT ctt_fMediumHigh;  // when to switch to high color   (normalized float!)
  FLOAT ctt_fLowMedium;   // when to switch to medium color (normalized float!)
  BOOL  ctt_bSmooth;      // should colors have smooth transition
};
static struct ColorTransitionTable _cttHUD;


// ammo's info structure
struct AmmoInfo {
  CTextureObject    *ai_ptoAmmo;
  struct WeaponInfo *ai_pwiWeapon1;
  struct WeaponInfo *ai_pwiWeapon2;
  INDEX ai_iAmmoAmmount;
  INDEX ai_iMaxAmmoAmmount;
  INDEX ai_iLastAmmoAmmount;
  TIME  ai_tmAmmoChanged;
  BOOL  ai_bHasWeapon;
};

// weapons' info structure
struct WeaponInfo {
  enum WeaponType  wi_wtWeapon;
  CTextureObject  *wi_ptoWeapon;
  struct AmmoInfo *wi_paiAmmo;
  BOOL wi_bHasWeapon;
};

INDEX iFragsLeft = 0;
INDEX iScoreLeft = 0;

extern struct WeaponInfo _awiWeapons[18];
static struct AmmoInfo _aaiAmmo[8] = {
  { &_toAShells,        &_awiWeapons[4],  &_awiWeapons[5],  0, 0, 0, -9, FALSE }, //  0
  { &_toABullets,       &_awiWeapons[6],  &_awiWeapons[7],  0, 0, 0, -9, FALSE }, //  1
  { &_toARockets,       &_awiWeapons[8],  NULL,             0, 0, 0, -9, FALSE }, //  2
  { &_toAGrenades,      &_awiWeapons[9],  NULL,             0, 0, 0, -9, FALSE }, //  3
  { &_toANapalm,        &_awiWeapons[11], NULL,             0, 0, 0, -9, FALSE }, //  4
  { &_toAElectricity,   &_awiWeapons[12], NULL,             0, 0, 0, -9, FALSE }, //  5
  { &_toAIronBall,      &_awiWeapons[14], NULL,             0, 0, 0, -9, FALSE }, //  6
  { &_toASniperBullets, &_awiWeapons[13], NULL,             0, 0, 0, -9, FALSE }, //  7
};
static const INDEX aiAmmoRemap[8] = { 0, 1, 2, 3, 4, 7, 5, 6 };

struct WeaponInfo _awiWeapons[18] = {
  { WEAPON_NONE,            NULL,                 NULL,         FALSE },   //  0
  { WEAPON_KNIFE,           &_toWKnife,           NULL,         FALSE },   //  1
  { WEAPON_COLT,            &_toWColt,            NULL,         FALSE },   //  2
  { WEAPON_DOUBLECOLT,      &_toWColt,            NULL,         FALSE },   //  3
  { WEAPON_SINGLESHOTGUN,   &_toWSingleShotgun,   &_aaiAmmo[0], FALSE },   //  4
  { WEAPON_DOUBLESHOTGUN,   &_toWDoubleShotgun,   &_aaiAmmo[0], FALSE },   //  5
  { WEAPON_TOMMYGUN,        &_toWTommygun,        &_aaiAmmo[1], FALSE },   //  6
  { WEAPON_MINIGUN,         &_toWMinigun,         &_aaiAmmo[1], FALSE },   //  7
  { WEAPON_ROCKETLAUNCHER,  &_toWRocketLauncher,  &_aaiAmmo[2], FALSE },   //  8
  { WEAPON_GRENADELAUNCHER, &_toWGrenadeLauncher, &_aaiAmmo[3], FALSE },   //  9
  { WEAPON_CHAINSAW,        &_toWChainsaw,        NULL,         FALSE },   // 10
  { WEAPON_FLAMER,          &_toWFlamer,          &_aaiAmmo[4], FALSE },   // 11
  { WEAPON_LASER,           &_toWLaser,           &_aaiAmmo[5], FALSE },   // 12
  { WEAPON_SNIPER,          &_toWSniper,          &_aaiAmmo[7], FALSE },   // 13
  { WEAPON_IRONCANNON,      &_toWIronCannon,      &_aaiAmmo[6], FALSE },   // 14
//{ WEAPON_PIPEBOMB,        &_toWPipeBomb,        &_aaiAmmo[3], FALSE },   // 15
//{ WEAPON_GHOSTBUSTER,     &_toWGhostBuster,     &_aaiAmmo[5], FALSE },   // 16
//{ WEAPON_NUKECANNON,      &_toWNukeCannon,      &_aaiAmmo[7], FALSE },   // 17
  { WEAPON_NONE,            NULL,                 NULL,         FALSE },   // 15
  { WEAPON_NONE,            NULL,                 NULL,         FALSE },   // 16
  { WEAPON_NONE,            NULL,                 NULL,         FALSE },   // 17
};


// compare functions for qsort()
static int qsort_CompareNames( const void *ppPEN0, const void *ppPEN1) {
  CPlayer &en0 = **(CPlayer**)ppPEN0;
  CPlayer &en1 = **(CPlayer**)ppPEN1;
  CTString strName0 = en0.GetPlayerName();
  CTString strName1 = en1.GetPlayerName();
  return strnicmp( strName0, strName1, 8);
}

static int qsort_CompareScores( const void *ppPEN0, const void *ppPEN1) {
  CPlayer &en0 = **(CPlayer**)ppPEN0;
  CPlayer &en1 = **(CPlayer**)ppPEN1;
  SLONG sl0 = en0.m_psGameStats.ps_iScore;
  SLONG sl1 = en1.m_psGameStats.ps_iScore;
  if(      sl0<sl1) return +1;
  else if( sl0>sl1) return -1;
  else              return  0;
}

static int qsort_CompareHealth( const void *ppPEN0, const void *ppPEN1) {
  CPlayer &en0 = **(CPlayer**)ppPEN0;
  CPlayer &en1 = **(CPlayer**)ppPEN1;
  SLONG sl0 = (SLONG)ceil(en0.GetHealth());
  SLONG sl1 = (SLONG)ceil(en1.GetHealth());
  if(      sl0<sl1) return +1;
  else if( sl0>sl1) return -1;
  else              return  0;
}

static int qsort_CompareManas( const void *ppPEN0, const void *ppPEN1) {
  CPlayer &en0 = **(CPlayer**)ppPEN0;
  CPlayer &en1 = **(CPlayer**)ppPEN1;
  SLONG sl0 = en0.m_iMana;
  SLONG sl1 = en1.m_iMana;
  if(      sl0<sl1) return +1;
  else if( sl0>sl1) return -1;
  else              return  0;
}

static int qsort_CompareDeaths( const void *ppPEN0, const void *ppPEN1) {
  CPlayer &en0 = **(CPlayer**)ppPEN0;
  CPlayer &en1 = **(CPlayer**)ppPEN1;
  SLONG sl0 = en0.m_psGameStats.ps_iDeaths;
  SLONG sl1 = en1.m_psGameStats.ps_iDeaths;
  if(      sl0<sl1) return +1;
  else if( sl0>sl1) return -1;
  else              return  0;
}

static int qsort_CompareFrags( const void *ppPEN0, const void *ppPEN1) {
  CPlayer &en0 = **(CPlayer**)ppPEN0;
  CPlayer &en1 = **(CPlayer**)ppPEN1;
  SLONG sl0 = en0.m_psGameStats.ps_iKills;
  SLONG sl1 = en1.m_psGameStats.ps_iKills;
  if(      sl0<sl1) return +1;
  else if( sl0>sl1) return -1;
  else              return -qsort_CompareDeaths(ppPEN0, ppPEN1);
}

static int qsort_CompareLatencies( const void *ppPEN0, const void *ppPEN1) {
  CPlayer &en0 = **(CPlayer**)ppPEN0;
  CPlayer &en1 = **(CPlayer**)ppPEN1;
  SLONG sl0 = (SLONG)ceil(en0.m_tmLatency);
  SLONG sl1 = (SLONG)ceil(en1.m_tmLatency);
  if(      sl0<sl1) return +1;
  else if( sl0>sl1) return -1;
  else              return  0;
}

// prepare color transitions
static void PrepareColorTransitions( COLOR colFine, COLOR colHigh, COLOR colMedium, COLOR colLow,
                                     FLOAT fMediumHigh, FLOAT fLowMedium, BOOL bSmooth)
{
  _cttHUD.ctt_colFine     = colFine;
  _cttHUD.ctt_colHigh     = colHigh;   
  _cttHUD.ctt_colMedium   = colMedium;
  _cttHUD.ctt_colLow      = colLow;
  _cttHUD.ctt_fMediumHigh = fMediumHigh;
  _cttHUD.ctt_fLowMedium  = fLowMedium;
  _cttHUD.ctt_bSmooth     = bSmooth;
}

//

static FLOAT MaxShieldForPlayer(const CPlayer* penPlayer)
{
  BOOL bCheatsEnabled = (GetSP()->sp_ctMaxPlayers==1||GetSP()->sp_bQuickTest) && penPlayer->m_penActionMarker==NULL;
  if (cht_fMaxShield>=0.0f && bCheatsEnabled) {
      return cht_fMaxShield;
  }
    FLOAT fExtraMaxShield = 0.0f;
    CGameStat* penGameStat = (CGameStat* )penPlayer->m_penGameStat.ep_pen;
    if (penGameStat==NULL) {
      return NULL;
    }
    if (penGameStat->m_iCreditsUsed >= 7 && GetSP()->sp_gmGameMode==CSessionProperties::GM_SURVIVALCOOP) {
      fExtraMaxShield = 5.0f*penGameStat->m_iCreditsUsed;
    }
    return penPlayer->m_fMaxShield + fExtraMaxShield + penPlayer->m_fExtraShield;
}

// calculates shake ammount and color value depanding on value change
#define SHAKE_TIME (2.0f)
static COLOR AddShaker( PIX const pixAmmount, INDEX const iCurrentValue, INDEX &iLastValue,
                        TIME &tmChanged, FLOAT &fMoverX, FLOAT &fMoverY)
{
  // update shaking if needed
  fMoverX = fMoverY = 0.0f;
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
  if( tmDelta > SHAKE_TIME) return NONE;
  ASSERT( tmDelta>=0);
  // shake, baby shake!
  const FLOAT fAmmount    = _fResolutionScaling * _fCustomScaling * pixAmmount;
  const FLOAT fMultiplier = (SHAKE_TIME-tmDelta)/SHAKE_TIME *fAmmount;
  const INDEX iRandomizer = (INDEX)(tmNow*511.0f)*fAmmount*iCurrentValue;
  const FLOAT fNormRnd1   = (FLOAT)((iRandomizer ^ (iRandomizer>>9)) & 1023) * 0.0009775f;  // 1/1023 - normalized
  const FLOAT fNormRnd2   = (FLOAT)((iRandomizer ^ (iRandomizer>>7)) & 1023) * 0.0009775f;  // 1/1023 - normalized
  fMoverX = (fNormRnd1 -0.5f) * fMultiplier;
  fMoverY = (fNormRnd2 -0.5f) * fMultiplier;
  // clamp to adjusted ammount (pixels relative to resolution and HUD scale
  fMoverX = Clamp( fMoverX, -fAmmount, fAmmount);
  fMoverY = Clamp( fMoverY, -fAmmount, fAmmount);
  if( tmDelta < SHAKE_TIME/3) return C_WHITE;
  else return NONE;
//return FloatToInt(tmDelta*4) & 1 ? C_WHITE : NONE;
}


// get current color from local color transitions table
static COLOR GetCurrentColor( FLOAT fNormalizedValue)
{
  // if value is in 'low' zone just return plain 'low' alert color
  if( fNormalizedValue < _cttHUD.ctt_fLowMedium) return( _cttHUD.ctt_colLow & 0xFFFFFF00);
  // if value is in out of 'extreme' zone just return 'extreme' color
  if( fNormalizedValue > 1.0f) return( _cttHUD.ctt_colFine & 0xFFFFFF00);
 
  COLOR col;
  // should blend colors?
  if( _cttHUD.ctt_bSmooth)
  { // lets do some interpolations
    FLOAT fd, f1, f2;
    COLOR col1, col2;
    UBYTE ubH,ubS,ubV, ubH2,ubS2,ubV2;
    // determine two colors for interpolation
    if( fNormalizedValue > _cttHUD.ctt_fMediumHigh) {
      f1   = 1.0f;
      f2   = _cttHUD.ctt_fMediumHigh;
      col1 = _cttHUD.ctt_colHigh;
      col2 = _cttHUD.ctt_colMedium;
    } else { // fNormalizedValue > _cttHUD.ctt_fLowMedium == TRUE !
      f1   = _cttHUD.ctt_fMediumHigh;
      f2   = _cttHUD.ctt_fLowMedium;
      col1 = _cttHUD.ctt_colMedium;
      col2 = _cttHUD.ctt_colLow;
    }
    // determine interpolation strength
    fd = (fNormalizedValue-f2) / (f1-f2);
    // convert colors to HSV
    ColorToHSV( col1, ubH,  ubS,  ubV);
    ColorToHSV( col2, ubH2, ubS2, ubV2);
    // interpolate H, S and V components
    ubH = (UBYTE)(ubH*fd + ubH2*(1.0f-fd));
    ubS = (UBYTE)(ubS*fd + ubS2*(1.0f-fd));
    ubV = (UBYTE)(ubV*fd + ubV2*(1.0f-fd));
    // convert HSV back to COLOR
    col = HSVToColor( ubH, ubS, ubV);
  }
  else
  { // simple color picker
    col = _cttHUD.ctt_colMedium;
    if( fNormalizedValue > _cttHUD.ctt_fMediumHigh) col = _cttHUD.ctt_colHigh;
  }
  // all done
  return( col & 0xFFFFFF00);
}



// fill array with players' statistics (returns current number of players in game)
extern INDEX SetAllPlayersStats( INDEX iSortKey)
{
  // determine maximum number of players for this session
  INDEX iPlayers    = 0;
  INDEX iMaxPlayers = _penPlayer->GetMaxPlayers();
  CPlayer *penCurrent;
  // loop thru potentional players 
  for( INDEX i=0; i<iMaxPlayers; i++)
  { // ignore non-existent players
    penCurrent = (CPlayer*)&*_penPlayer->GetPlayerEntity(i);
    if( penCurrent==NULL) continue;
    // fill in player parameters
    _apenPlayers[iPlayers] = penCurrent;
    // advance to next real player
    iPlayers++;
  }
  // sort statistics by some key if needed
  switch( iSortKey) {
  case PSK_NAME:    qsort( _apenPlayers, iPlayers, sizeof(CPlayer*), qsort_CompareNames);   break;
  case PSK_SCORE:   qsort( _apenPlayers, iPlayers, sizeof(CPlayer*), qsort_CompareScores);  break;
  case PSK_HEALTH:  qsort( _apenPlayers, iPlayers, sizeof(CPlayer*), qsort_CompareHealth);  break;
  case PSK_MANA:    qsort( _apenPlayers, iPlayers, sizeof(CPlayer*), qsort_CompareManas);   break;
  case PSK_FRAGS:   qsort( _apenPlayers, iPlayers, sizeof(CPlayer*), qsort_CompareFrags);   break;
  case PSK_DEATHS:  qsort( _apenPlayers, iPlayers, sizeof(CPlayer*), qsort_CompareDeaths);  break;
  default:  break;  // invalid or NONE key specified so do nothing
  }
  // all done
  return iPlayers;
}



// ----------------------- drawing functions

// draw border with filter
static void HUD_DrawBorder( FLOAT fCenterX, FLOAT fCenterY, FLOAT fSizeX, FLOAT fSizeY, COLOR colTiles)
{
  // determine location
  const FLOAT fCenterI  = fCenterX*_pixDPWidth  / 640.0f;
  const FLOAT fCenterJ  = fCenterY*_pixDPHeight / (480.0f * _pDP->dp_fWideAdjustment);
  const FLOAT fSizeI    = _fResolutionScaling*fSizeX;
  const FLOAT fSizeJ    = _fResolutionScaling*fSizeY;
  const FLOAT fTileSize = 8*_fResolutionScaling*_fCustomScaling;
  // determine exact positions
  const FLOAT fLeft  = fCenterI  - fSizeI/2 -1; 
  const FLOAT fRight = fCenterI  + fSizeI/2 +1; 
  const FLOAT fUp    = fCenterJ  - fSizeJ/2 -1; 
  const FLOAT fDown  = fCenterJ  + fSizeJ/2 +1;
  const FLOAT fLeftEnd  = fLeft  + fTileSize;
  const FLOAT fRightBeg = fRight - fTileSize; 
  const FLOAT fUpEnd    = fUp    + fTileSize; 
  const FLOAT fDownBeg  = fDown  - fTileSize; 
  // prepare texture                 
  colTiles |= _ulAlphaHUD;
  // put corners
  _pDP->InitTexture( &_toTile, TRUE); // clamping on!
  _pDP->AddTexture( fLeft, fUp,   fLeftEnd, fUpEnd,   colTiles);
  _pDP->AddTexture( fRight,fUp,   fRightBeg,fUpEnd,   colTiles);
  _pDP->AddTexture( fRight,fDown, fRightBeg,fDownBeg, colTiles);
  _pDP->AddTexture( fLeft, fDown, fLeftEnd, fDownBeg, colTiles);
  // put edges
  _pDP->AddTexture( fLeftEnd,fUp,    fRightBeg,fUpEnd,   0.4f,0.0f, 0.6f,1.0f, colTiles);
  _pDP->AddTexture( fLeftEnd,fDown,  fRightBeg,fDownBeg, 0.4f,0.0f, 0.6f,1.0f, colTiles);
  _pDP->AddTexture( fLeft,   fUpEnd, fLeftEnd, fDownBeg, 0.0f,0.4f, 1.0f,0.6f, colTiles);
  _pDP->AddTexture( fRight,  fUpEnd, fRightBeg,fDownBeg, 0.0f,0.4f, 1.0f,0.6f, colTiles);
  // put center
  _pDP->AddTexture( fLeftEnd, fUpEnd, fRightBeg, fDownBeg, 0.4f,0.4f, 0.6f,0.6f, colTiles);
  _pDP->FlushRenderingQueue();
}

// ----------------------- SeriousAlexej - Scoreboard background - START

// draw border with filter
enum EScreenPos
{
  ESP_Start,
  ESP_Middle,
  ESP_End
};


static void DIO_DrawBcg
(
  EScreenPos x_anchor, INDEX x_offset,
  EScreenPos y_anchor, INDEX y_offset,
  EScreenPos x_growth, FLOAT width,
  EScreenPos y_growth, FLOAT height,
  COLOR color
)
{
  const FLOAT half_width = width*0.5f * _dioHUDScaling;
  const FLOAT half_height = height*0.5f * _dioHUDScaling;
  
  FLOAT x_pos = 0.0f;
  if (x_anchor == ESP_Middle) {
    x_pos = _pixDPWidth / 2;
  } else if (x_anchor == ESP_End) {
    x_pos = _pixDPWidth;
  }
  FLOAT x_growth_offset = -half_width;
  if (x_growth == ESP_Start) {
    x_growth_offset = 0.0f;
  } else if (x_growth == ESP_End) {
    x_growth_offset *= 2.0f;
  }
  x_pos += static_cast<FLOAT>(x_offset) * _dioHUDScaling + x_growth_offset;
  FLOAT x_pos_end = x_pos + half_width + half_width;
  
  FLOAT y_pos = 0.0f;
  if (y_anchor == ESP_Middle) {
    y_pos = _pixDPHeight / 2;
  } else if (y_anchor == ESP_End) {
    y_pos = _pixDPHeight;
  }
  FLOAT y_growth_offset = -half_height;
  if (y_growth == ESP_Start) {
    y_growth_offset = 0.0f;
  } else if (x_growth == ESP_End) {
    y_growth_offset *= 2.0f;
  }
  y_pos += static_cast<FLOAT>(y_offset) * _dioHUDScaling + y_growth_offset;
  FLOAT y_pos_end = y_pos + half_height + half_height;

  
  FLOAT colAlpha = (color & 0xFF) / static_cast<FLOAT>(0xFF);
  color &= 0xFFFFFF00;
  color |= NormFloatToByte(colAlpha * (_ulAlphaHUD / static_cast<FLOAT>(0xFF)));

  FLOAT tmp;
  if (width < 0.0f)
  {
    tmp = x_pos;
    x_pos = x_pos_end;
    x_pos_end = tmp;
  }
  if (height < 0.0f)
  {
    tmp = y_pos;
    y_pos = y_pos_end;
    y_pos_end = tmp;
  } 
    _pDP->Fill(x_pos, y_pos, x_pos_end - x_pos, y_pos_end - y_pos, color);
}

// ----------------------- SeriousAlexej - Scoreboard background - END

// ----------------------- SeriousAlexej - Scoreboard text - START

static void DIO_DrawText //(x-position, y-position, "text", size, alignment, color)
(
  EScreenPos x_anchor, INDEX x_offset,
  EScreenPos y_anchor, INDEX y_offset,
  const CTString &strText,
  FLOAT textScale,
  EScreenPos text_alignment,
  COLOR col
)
{
  _pDP->SetTextCharSpacing(textScale * _dioHUDScaling * _pDP->dp_FontData->fd_pixCharSpacing);
  _pDP->SetTextScaling(textScale * _dioHUDScaling);

  FLOAT text_width = _pDP->GetTextWidth(strText);
  const FLOAT text_height = _pDP->dp_FontData->fd_pixCharHeight * _pDP->dp_fTextScaling;

  FLOAT x_pos = 0.0f;
  if (x_anchor == ESP_Middle) {
    x_pos = _pixDPWidth / 2;
  } else if (x_anchor == ESP_End) {
    x_pos = _pixDPWidth;
  }
  if (text_alignment == ESP_Start) {
    text_width = 0.0f;
  } else if (text_alignment == ESP_Middle) {
    text_width *= 0.5f;
  }
  x_pos += static_cast<FLOAT>(x_offset) * _dioHUDScaling - text_width;
  
  FLOAT y_pos = 0.0f;
  if (y_anchor == ESP_Middle) {
    y_pos = _pixDPHeight / 2;
  } else if (y_anchor == ESP_End) {
    y_pos = _pixDPHeight;
  }
  y_pos += static_cast<FLOAT>(y_offset) * _dioHUDScaling - text_height;

  _pDP->PutText(strText, x_pos, y_pos, col|_ulAlphaHUD);
}

// ----------------------- SeriousAlexej - Scoreboard text - END

// ----------------------- SeriousAlexej Scoreboard icon - START
static void DIO_DrawIcon //(x-position, y-position, texture, angle (for direction to player), color)
(
  EScreenPos x_anchor, INDEX x_offset,
  EScreenPos y_anchor, INDEX y_offset,
  CTextureObject &toIcon,
  ANGLE angle = 0.0f,
  COLOR color = C_WHITE
)
{
  CTextureData* ptd = (CTextureData*)toIcon.GetData();
  const FLOAT half_width = ptd->GetPixWidth()*0.5f * _dioHUDScaling;
  const FLOAT half_height = ptd->GetPixHeight()*0.5f * _dioHUDScaling;

  FLOAT x_pos = 0.0f;
  if (x_anchor == ESP_Middle) {
    x_pos = _pixDPWidth / 2;
  } else if (x_anchor == ESP_End) {
    x_pos = _pixDPWidth;
  }
  x_pos += static_cast<FLOAT>(x_offset) * _dioHUDScaling - half_width;
  const FLOAT x_pos_end = x_pos + half_width + half_width;
  
  FLOAT y_pos = 0.0f;
  if (y_anchor == ESP_Middle) {
    y_pos = _pixDPHeight / 2;
  } else if (y_anchor == ESP_End) {
    y_pos = _pixDPHeight;
  }
  y_pos += static_cast<FLOAT>(y_offset) * _dioHUDScaling - half_height;
  const FLOAT y_pos_end = y_pos + half_height + half_height;

  _pDP->InitTexture(&toIcon);
  
  FLOAT3D p0(x_pos, y_pos, 1.0f);
  FLOAT3D p1(x_pos_end, y_pos, 1.0f);
  FLOAT3D p2(x_pos_end, y_pos_end, 1.0f);
  FLOAT3D p3(x_pos, y_pos_end, 1.0f);

  if (angle != 0.0f)
  {
	FLOAT2D vtoCenter(x_pos + half_width, y_pos + half_height);
    FLOATmatrix3D toCenter(0.0f);
    toCenter(1, 3) = vtoCenter(1);
    toCenter(2, 3) = vtoCenter(2);
    toCenter(1, 1) = 1.0f;
    toCenter(2, 2) = 1.0f;
    toCenter(3, 3) = 1.0f;
    FLOATmatrix3D fromCenter(0.0f);
    fromCenter(1, 3) = -vtoCenter(1);
    fromCenter(2, 3) = -vtoCenter(2);
    fromCenter(1, 1) = 1.0f;
    fromCenter(2, 2) = 1.0f;
    fromCenter(3, 3) = 1.0f;
    FLOATmatrix3D rotate(0.0f);
    rotate(1, 1) = cos(angle);
    rotate(1, 2) = -sin(angle);
    rotate(2, 1) = -rotate(1, 2);
    rotate(2, 2) = rotate(1, 1);
    rotate(3, 3) = 1.0f;
    FLOATmatrix3D transformMatrix = toCenter * rotate * fromCenter;

    p0 = p0 * transformMatrix;
    p1 = p1 * transformMatrix;
    p2 = p2 * transformMatrix;
    p3 = p3 * transformMatrix;
  }
  
  _pDP->AddTexture(
    p0(1), p0(2), 0.0f, 0.0f, color|_ulAlphaHUD,
    p1(1), p1(2), 1.0f, 0.0f, color|_ulAlphaHUD,
    p2(1), p2(2), 1.0f, 1.0f, color|_ulAlphaHUD,
    p3(1), p3(2), 0.0f, 1.0f, color|_ulAlphaHUD
    );

  _pDP->FlushRenderingQueue();
}

FLOAT GetAngleFromTo(const CPlayer* from, const CPlayer* to)
{
  if (from == to)
    return 0.0f;
  CPlacement3D pl_from(FLOAT3D(0,0,0), ANGLE3D(from->en_plViewpoint.pl_OrientationAngle(1),0,0));
  pl_from.RelativeToAbsolute(from->GetPlacement());
  CPlacement3D pl_to = to->GetPlacement();
  pl_to.AbsoluteToRelative(pl_from);
  FLOAT2D v1(0.0f, 1.0f);
  FLOAT2D v2(pl_to.pl_PositionVector(1), -pl_to.pl_PositionVector(3));
  FLOAT v2_length = v2.Length();
  if (v2_length < 0.01f)
    return 0.0f;
  FLOAT angle = (v1 % v2) / v2_length;
  angle = acos(Clamp(angle, -1.0f, 1.0f));
  if (v2(1) < 0.0f)
    angle *= -1.0f;
  return angle;
}
// ----------------------- SeriousAlexej - Scoreboard icon - END

// draw icon texture (if color = NONE, use colortransitions structure)
static void HUD_DrawIcon( FLOAT fCenterX, FLOAT fCenterY, CTextureObject &toIcon,
                          COLOR colDefault, FLOAT fNormValue, BOOL bBlink)
{
  // determine color
  COLOR col = colDefault;
  if( col==NONE) col = GetCurrentColor( fNormValue);
  // determine blinking state
  if( bBlink && fNormValue<=(_cttHUD.ctt_fLowMedium/2)) {
    // activate blinking only if value is <= half the low edge
    INDEX iCurrentTime = (INDEX)(_tmNow*4);
    if( iCurrentTime&1) col = C_vdGRAY;
  }
  // determine location
  const FLOAT fCenterI = fCenterX*_pixDPWidth  / 640.0f;
  const FLOAT fCenterJ = fCenterY*_pixDPHeight / (480.0f * _pDP->dp_fWideAdjustment);
  // determine dimensions
  CTextureData *ptd = (CTextureData*)toIcon.GetData();
  const FLOAT fHalfSizeI = _fResolutionScaling*_fCustomScaling * ptd->GetPixWidth()  *0.5f;
  const FLOAT fHalfSizeJ = _fResolutionScaling*_fCustomScaling * ptd->GetPixHeight() *0.5f;
  // done
  _pDP->InitTexture( &toIcon);
  _pDP->AddTexture( fCenterI-fHalfSizeI, fCenterJ-fHalfSizeJ,
                    fCenterI+fHalfSizeI, fCenterJ+fHalfSizeJ, col|_ulAlphaHUD);
  _pDP->FlushRenderingQueue();
}


// draw text (or numbers, whatever)
static void HUD_DrawText( FLOAT fCenterX, FLOAT fCenterY, const CTString &strText,
                          COLOR colDefault, FLOAT fNormValue)
{
  // determine color
  COLOR col = colDefault;
  if( col==NONE) col = GetCurrentColor( fNormValue);
  // determine location
  PIX pixCenterI = (PIX)(fCenterX*_pixDPWidth  / 640.0f);
  PIX pixCenterJ = (PIX)(fCenterY*_pixDPHeight / (480.0f * _pDP->dp_fWideAdjustment));
  // done
  _pDP->SetTextScaling( _fResolutionScaling*_fCustomScaling);
  _pDP->PutTextCXY( strText, pixCenterI, pixCenterJ, col|_ulAlphaHUD);
}


// draw bar
static void HUD_DrawBar( FLOAT fCenterX, FLOAT fCenterY, PIX pixSizeX, PIX pixSizeY,
                         enum BarOrientations eBarOrientation, COLOR colDefault, FLOAT fNormValue)
{
  // determine color
  COLOR col = colDefault;
  if( col==NONE) col = GetCurrentColor( fNormValue);
  // determine location and size
  PIX pixCenterI = (PIX)(fCenterX*_pixDPWidth  / 640.0f);
  PIX pixCenterJ = (PIX)(fCenterY*_pixDPHeight / (480.0f * _pDP->dp_fWideAdjustment));
  PIX pixSizeI   = (PIX)(_fResolutionScaling*pixSizeX);
  PIX pixSizeJ   = (PIX)(_fResolutionScaling*pixSizeY);
  // fill bar background area
  PIX pixLeft  = pixCenterI-pixSizeI/2;
  PIX pixUpper = pixCenterJ-pixSizeJ/2;
  // determine bar position and inner size
  switch( eBarOrientation) {
  case BO_UP:
    pixSizeJ *= fNormValue;
    break;
  case BO_DOWN:
    pixUpper  = pixUpper + (PIX)ceil(pixSizeJ * (1.0f-fNormValue));
    pixSizeJ *= fNormValue;
    break;
  case BO_LEFT:
    pixSizeI *= fNormValue;
    break;
  case BO_RIGHT:
    pixLeft   = pixLeft + (PIX)ceil(pixSizeI * (1.0f-fNormValue));
    pixSizeI *= fNormValue;
    break;
  }
  // done
  _pDP->Fill( pixLeft, pixUpper, pixSizeI, pixSizeJ, col|_ulAlphaHUD);
}

static void DrawRotatedQuad( class CTextureObject *_pTO, FLOAT fX, FLOAT fY, FLOAT fSize, ANGLE aAngle, COLOR col)
{
  FLOAT fSinA = Sin(aAngle);
  FLOAT fCosA = Cos(aAngle);
  FLOAT fSinPCos = fCosA*fSize+fSinA*fSize;
  FLOAT fSinMCos = fSinA*fSize-fCosA*fSize;
  FLOAT fI0, fJ0, fI1, fJ1, fI2, fJ2, fI3, fJ3;

  fI0 = fX-fSinPCos;  fJ0 = fY-fSinMCos;
  fI1 = fX+fSinMCos;  fJ1 = fY-fSinPCos;
  fI2 = fX+fSinPCos;  fJ2 = fY+fSinMCos;
  fI3 = fX-fSinMCos;  fJ3 = fY+fSinPCos;
  
  _pDP->InitTexture( _pTO);
  _pDP->AddTexture( fI0, fJ0, 0, 0, col,   fI1, fJ1, 0, 1, col,
                    fI2, fJ2, 1, 1, col,   fI3, fJ3, 1, 0, col);
  _pDP->FlushRenderingQueue();  

}

static void DrawAspectCorrectTextureCentered( class CTextureObject *_pTO, FLOAT fX, FLOAT fY, FLOAT fWidth, COLOR col)
{
  CTextureData *ptd = (CTextureData*)_pTO->GetData();
  FLOAT fTexSizeI = ptd->GetPixWidth();
  FLOAT fTexSizeJ = ptd->GetPixHeight();
  FLOAT fHeight = fWidth*fTexSizeJ/fTexSizeJ;
  
  _pDP->InitTexture( _pTO);
  _pDP->AddTexture ( fX-fWidth*0.5f, fY-fHeight*0.5f, fX+fWidth*0.5f, fY+fHeight*0.5f, 0, 0, 1, 1, col);
  _pDP->FlushRenderingQueue();
}

// draw sniper mask
/*static*/extern void HUD_DrawSniperMask(const CPlayer *penPlayerCurrent, CDrawPort *pdpCurrent /*void*/ )
{
  _penPlayer  = penPlayerCurrent;
  _penWeapons = (CPlayerWeapons*)&*_penPlayer->m_penWeapons;
  _pDP                = pdpCurrent;
  _pixDPWidth         = _pDP->GetWidth();
  _pixDPHeight        = _pDP->GetHeight();
  _fCustomScaling     = hud_fScaling;
  _fResolutionScaling = (FLOAT)_pixDPWidth /640.0f;
  _colHUD             = hud_iHUDColor;//0x4C80BB00;
  _colHUDText         = SE_COL_ORANGE_LIGHT;
  _ulAlphaHUD         = NormFloatToByte(hud_fOpacity);
  _tmNow              = _pTimer->CurrentTick();
  // determine location
  const FLOAT fSizeI = _pixDPWidth;
  const FLOAT fSizeJ = _pixDPHeight;
  const FLOAT fCenterI = fSizeI/2;  
  const FLOAT fCenterJ = fSizeJ/2;  
  const FLOAT fBlackStrip = (fSizeI-fSizeJ)/2;

  COLOR colMask = C_WHITE|CT_OPAQUE;
  
  CTextureData *ptd = (CTextureData*)_toSniperMask.GetData();
  const FLOAT fTexSizeI = ptd->GetPixWidth();
  const FLOAT fTexSizeJ = ptd->GetPixHeight();

  // main sniper mask
  _pDP->InitTexture( &_toSniperMask);
  _pDP->AddTexture( fBlackStrip, 0, fCenterI, fCenterJ, 0.98f, 0.02f, 0, 1.0f, colMask);
  _pDP->AddTexture( fCenterI, 0, fSizeI-fBlackStrip, fCenterJ, 0, 0.02f, 0.98f, 1.0f, colMask);
  _pDP->AddTexture( fBlackStrip, fCenterJ, fCenterI, fSizeJ, 0.98f, 1.0f, 0, 0.02f, colMask);
  _pDP->AddTexture( fCenterI, fCenterJ, fSizeI-fBlackStrip, fSizeJ, 0, 1, 0.98f, 0.02f, colMask);
  _pDP->FlushRenderingQueue();
  _pDP->Fill( 0, 0, fBlackStrip+1, fSizeJ, C_BLACK|CT_OPAQUE);
  _pDP->Fill( fSizeI-fBlackStrip-1, 0, fBlackStrip+1, fSizeJ, C_BLACK|CT_OPAQUE);

  colMask = LerpColor(SE_COL_BLUE_LIGHT, C_WHITE, 0.25f);

  FLOAT _fYResolutionScaling = (FLOAT)_pixDPHeight/480.0f;

  FLOAT fDistance = _penWeapons->m_fRayHitDistance;
  FLOAT aFOV = Lerp(_penWeapons->m_fSniperFOVlast, _penWeapons->m_fSniperFOV,
                    _pTimer->GetLerpFactor());
  CTString strTmp;
  
  // wheel
  FLOAT fZoom = 1.0f/tan(RadAngle(aFOV)*0.5f);  // 2.0 - 8.0
  
  FLOAT fAFact = (Clamp(aFOV, 14.2f, 53.1f)-14.2f)/(53.1f-14.2f); // only for zooms 2x-4x !!!!!!
  ANGLE aAngle = 314.0f+fAFact*292.0f;

  const FLOAT3D vRayHit = _penWeapons->m_vRayHit;  // Change color for sniper wheel
    // if hit anything
  COLOR colSniperWheel = C_WHITE|0x44;
  if( _penWeapons->m_penRayHit!=NULL) {

    CEntity *pen = _penWeapons->m_penRayHit;
    // if required, show enemy health thru crosshair color

    if( _penWeapons->m_fEnemyHealth>0) {
           if( _penWeapons->m_fEnemyHealth<0.25f) { colSniperWheel = C_RED|0x88;    }
      else if( _penWeapons->m_fEnemyHealth<0.60f) { colSniperWheel = C_YELLOW|0x88; }
      else                                        { colSniperWheel = C_GREEN|0x88;  }
    }
  }

  DrawRotatedQuad(&_toSniperWheel, fCenterI, fCenterJ, 40.0f*_fYResolutionScaling,
                  aAngle, colSniperWheel/*colMask|0x44*/);
  
  FLOAT fTM = _pTimer->GetLerpedCurrentTick();
  
  COLOR colLED;
  if (_penWeapons->m_tmLastSniperFire+1.25f<fTM) { // blinking
    colLED = 0x44FF22BB;
  } else {
    colLED = 0xFF4422DD;
  }

  // reload indicator
  DrawAspectCorrectTextureCentered(&_toSniperLed, fCenterI-37.0f*_fYResolutionScaling,
    fCenterJ+36.0f*_fYResolutionScaling, 15.0f*_fYResolutionScaling, colLED);
    
  if (_fResolutionScaling>=1.0f)
  {
    FLOAT _fIconSize;
    FLOAT _fLeftX,  _fLeftYU,  _fLeftYD;
    FLOAT _fRightX, _fRightYU, _fRightYD;

    if (_fResolutionScaling<=1.3f) {
      _pDP->SetFont( _pfdConsoleFont);
      _pDP->SetTextAspect( 1.0f);
      _pDP->SetTextScaling(1.0f);
      _fIconSize = 22.8f;
      _fLeftX = 159.0f;
      _fLeftYU = 8.0f;
      _fLeftYD = 6.0f;
      _fRightX = 159.0f;
      _fRightYU = 11.0f;
      _fRightYD = 6.0f;
    } else {
      _pDP->SetFont( _pfdDisplayFont);
      _pDP->SetTextAspect( 1.0f);
      _pDP->SetTextScaling(0.7f*_fYResolutionScaling);
      _fIconSize = 19.0f;
      _fLeftX = 162.0f;
      _fLeftYU = 8.0f;
      _fLeftYD = 6.0f;
      _fRightX = 162.0f;
      _fRightYU = 11.0f;
      _fRightYD = 6.0f;
    }
     
    // arrow + distance
    DrawAspectCorrectTextureCentered(&_toSniperArrow, fCenterI-_fLeftX*_fYResolutionScaling,
      fCenterJ-_fLeftYU*_fYResolutionScaling, _fIconSize*_fYResolutionScaling, 0xFFCC3399 );
    if (fDistance>9999.9f) { strTmp.PrintF("---.-");           }
    else if (TRUE)         { strTmp.PrintF("%.1f", fDistance); }
    _pDP->PutTextC( strTmp, fCenterI-_fLeftX*_fYResolutionScaling,
      fCenterJ+_fLeftYD*_fYResolutionScaling, colMask|0xaa);
    
    // eye + zoom level
    DrawAspectCorrectTextureCentered(&_toSniperEye,   fCenterI+_fRightX*_fYResolutionScaling,
      fCenterJ-_fRightYU*_fYResolutionScaling, _fIconSize*_fYResolutionScaling, 0xFFCC3399 ); //SE_COL_ORANGE_L
    strTmp.PrintF("%.1fx", fZoom);
    _pDP->PutTextC( strTmp, fCenterI+_fRightX*_fYResolutionScaling,
      fCenterJ+_fRightYD*_fYResolutionScaling, colMask|0xaa);
  }
}


// helper functions

// fill weapon and ammo table with current state
static void FillWeaponAmmoTables(CPlayerWeapons* penWeapons)
{
  // ammo quantities
  _aaiAmmo[0].ai_iAmmoAmmount    = penWeapons->m_iShells;
  _aaiAmmo[0].ai_iMaxAmmoAmmount = penWeapons->m_iMaxShells;
  _aaiAmmo[1].ai_iAmmoAmmount    = penWeapons->m_iBullets;
  _aaiAmmo[1].ai_iMaxAmmoAmmount = penWeapons->m_iMaxBullets;
  _aaiAmmo[2].ai_iAmmoAmmount    = penWeapons->m_iRockets;
  _aaiAmmo[2].ai_iMaxAmmoAmmount = penWeapons->m_iMaxRockets;
  _aaiAmmo[3].ai_iAmmoAmmount    = penWeapons->m_iGrenades;
  _aaiAmmo[3].ai_iMaxAmmoAmmount = penWeapons->m_iMaxGrenades;
  _aaiAmmo[4].ai_iAmmoAmmount    = penWeapons->m_iNapalm;
  _aaiAmmo[4].ai_iMaxAmmoAmmount = penWeapons->m_iMaxNapalm;
  _aaiAmmo[5].ai_iAmmoAmmount    = penWeapons->m_iElectricity;
  _aaiAmmo[5].ai_iMaxAmmoAmmount = penWeapons->m_iMaxElectricity;
  _aaiAmmo[6].ai_iAmmoAmmount    = penWeapons->m_iIronBalls;
  _aaiAmmo[6].ai_iMaxAmmoAmmount = penWeapons->m_iMaxIronBalls;
  _aaiAmmo[7].ai_iAmmoAmmount    = penWeapons->m_iSniperBullets;
  _aaiAmmo[7].ai_iMaxAmmoAmmount = penWeapons->m_iMaxSniperBullets;

  // prepare ammo table for weapon possesion
  INDEX i, iAvailableWeapons = penWeapons->m_iAvailableWeapons; 
  for( i=0; i<8; i++) _aaiAmmo[i].ai_bHasWeapon = FALSE;
  // weapon possesion
  for( i=WEAPON_NONE+1; i<WEAPON_LAST; i++)
  {
    if( _awiWeapons[i].wi_wtWeapon!=WEAPON_NONE)
    {
      // regular weapons
      _awiWeapons[i].wi_bHasWeapon = (iAvailableWeapons&(1<<(_awiWeapons[i].wi_wtWeapon-1)));
      if( _awiWeapons[i].wi_paiAmmo!=NULL) _awiWeapons[i].wi_paiAmmo->ai_bHasWeapon |= _awiWeapons[i].wi_bHasWeapon;
    }
  }
}

//<<<<<<< DEBUG FUNCTIONS >>>>>>>

#ifdef ENTITY_DEBUG
CRationalEntity *DBG_prenStackOutputEntity = NULL;
#endif
void HUD_SetEntityForStackDisplay(CRationalEntity *pren)
{
#ifdef ENTITY_DEBUG
  DBG_prenStackOutputEntity = pren;
#endif
  return;
}

#ifdef ENTITY_DEBUG
static void HUD_DrawEntityStack()
{
  CTString strTemp;
  PIX pixFontHeight;
  ULONG pixTextBottom;

  if (tmp_ai[9]==12345)
  {
    if (DBG_prenStackOutputEntity!=NULL)
    {
      pixFontHeight = _pfdConsoleFont->fd_pixCharHeight;
      pixTextBottom = _pixDPHeight*0.83;
      _pDP->SetFont( _pfdConsoleFont);
      _pDP->SetTextScaling( 1.0f);
    
      INDEX ctStates = DBG_prenStackOutputEntity->en_stslStateStack.Count();
      strTemp.PrintF("-- stack of '%s'(%s)@%gs\n", DBG_prenStackOutputEntity->GetName(),
        DBG_prenStackOutputEntity->en_pecClass->ec_pdecDLLClass->dec_strName,
        _pTimer->CurrentTick());
      _pDP->PutText( strTemp, 1, pixTextBottom-pixFontHeight*(ctStates+1), _colHUD|_ulAlphaHUD);
      
      for(INDEX iState=ctStates-1; iState>=0; iState--) {
        SLONG slState = DBG_prenStackOutputEntity->en_stslStateStack[iState];
        strTemp.PrintF("0x%08x %s\n", slState, 
          DBG_prenStackOutputEntity->en_pecClass->ec_pdecDLLClass->HandlerNameForState(slState));
        _pDP->PutText( strTemp, 1, pixTextBottom-pixFontHeight*(iState+1), _colHUD|_ulAlphaHUD);
      }
    }
  }
}
#endif
//<<<<<<< DEBUG FUNCTIONS >>>>>>>

// main

// render interface (frontend) to drawport
// (units are in pixels for 640x480 resolution - for other res HUD will be scalled automatically)
extern void DrawHUD( const CPlayer *penPlayerCurrent, CDrawPort *pdpCurrent,/* BOOL bSnooping, */const CPlayer *penPlayerOwner)
{
  // no player - no info, sorry
  if( penPlayerCurrent==NULL || (penPlayerCurrent->GetFlags()&ENF_DELETED)) return;
  
  // if snooping and owner player ins NULL, return
//  if ( bSnooping && penPlayerOwner==NULL) return;

  // find last values in case of predictor
  CPlayer *penLast = (CPlayer*)penPlayerCurrent;
  //if( penPlayerCurrent->IsPredictor()) penLast = (CPlayer*)(((CPlayer*)penPlayerCurrent)->GetPredicted());
  //ASSERT( penLast!=NULL);
  //if( penLast==NULL) return; // !!!! just in case

  // cache local variables
  hud_fOpacity = Clamp( hud_fOpacity, 0.1f, 1.0f);
  hud_fScaling = Clamp( hud_fScaling, 0.5f, 1.2f);
  _penPlayer  = penPlayerCurrent;
  _penWeapons = (CPlayerWeapons*)&*_penPlayer->m_penWeapons;
  _pDP                = pdpCurrent;
  _pixDPWidth         = _pDP->GetWidth();
  _pixDPHeight        = _pDP->GetHeight();
  _fCustomScaling     = hud_fScaling;
  _fResolutionScaling = (FLOAT)_pixDPWidth /640.0f;
  _colHUD             = hud_iHUDColor;//0x4C80BB00;
  _colHUDText         = SE_COL_ORANGE_LIGHT;
  _ulAlphaHUD         = NormFloatToByte(hud_fOpacity);
  _tmNow              = _pTimer->CurrentTick();

  _dioHUDScaling = _pixDPHeight / 1080.0f;

  // determine hud colorization;
  COLOR colMax = SE_COL_BLUEGREEN_LT;
  COLOR colTop = SE_COL_ORANGE_LIGHT;
  COLOR colMid = LerpColor(colTop, C_RED, 0.5f);

  // adjust borders color in case of spying mode
  COLOR colBorder = _colHUD; 
  
/*  if( bSnooping) {
    colBorder = SE_COL_ORANGE_NEUTRAL;
    if( ((ULONG)(_tmNow*5))&1) {
      //colBorder = (colBorder>>1) & 0x7F7F7F00; // darken flash and scale
      colBorder = SE_COL_ORANGE_DARK;
      _fCustomScaling *= 0.933f;
    }
  }*/

  // draw sniper mask (original mask even if snooping)
//  if (((CPlayerWeapons*)&*penPlayerOwner->m_penWeapons)->m_iCurrentWeapon==WEAPON_SNIPER
//    &&((CPlayerWeapons*)&*penPlayerOwner->m_penWeapons)->m_bSniping) {
//    HUD_DrawSniperMask();
//  } 
   
  // prepare font and text dimensions
  CTString strValue;
  PIX pixCharWidth;
  FLOAT fValue, fNormValue, fCol, fRow, fValueMax;
  _pDP->SetFont( &_fdNumbersFont);
  pixCharWidth = _fdNumbersFont.GetWidth() + _fdNumbersFont.GetCharSpacing() +1;
  FLOAT fChrUnit = pixCharWidth * _fCustomScaling;

  const PIX pixTopBound    = 6;
  const PIX pixLeftBound   = 6;
  const PIX pixBottomBound = (480 * _pDP->dp_fWideAdjustment) -pixTopBound;
  const PIX pixRightBound  = 640-pixLeftBound;
  FLOAT fOneUnit  = (32+0) * _fCustomScaling;  // unit size
  FLOAT fAdvUnit  = (32+4) * _fCustomScaling;  // unit advancer
  FLOAT fNextUnit = (32+8) * _fCustomScaling;  // unit advancer
  FLOAT fHalfUnit = fOneUnit * 0.5f;
  FLOAT fMoverX, fMoverY;
  COLOR colDefault;
  
  // prepare and draw health info
  fValue = ClampDn( _penPlayer->GetHealth(), 0.0f);  // never show negative health
  fNormValue = fValue/TOP_HEALTH;
  strValue.PrintF( "%d", (SLONG)ceil(fValue));
  PrepareColorTransitions( colMax, colTop, colMid, C_RED, 0.5f, 0.25f, FALSE);
  fRow = pixBottomBound-fHalfUnit;
  fCol = pixLeftBound+fHalfUnit;
  colDefault = AddShaker( 5, fValue, penLast->m_iLastHealth, penLast->m_tmHealthChanged, fMoverX, fMoverY);
  if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
    HUD_DrawBorder( fCol+fMoverX, fRow+fMoverY, fOneUnit, fOneUnit, colBorder);
  }
  fCol += fAdvUnit+fChrUnit*3/2 -fHalfUnit;
  if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
    HUD_DrawBorder( fCol, fRow, fChrUnit*3, fOneUnit, colBorder);
    HUD_DrawText( fCol, fRow, strValue, colDefault, fNormValue);
  }
  fCol -= fAdvUnit+fChrUnit*3/2 -fHalfUnit;
  if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
    HUD_DrawIcon( fCol+fMoverX, fRow+fMoverY, _toHealth, C_WHITE /*_colHUD*/, fNormValue, TRUE);
  }

  // prepare and draw armor info (eventually)
  fValue = _penPlayer->m_fArmor;
  if( fValue > 0.0f) {
    fNormValue = fValue/TOP_ARMOR;
    strValue.PrintF( "%d", (SLONG)ceil(fValue));
    PrepareColorTransitions( colMax, colTop, colMid, C_lGRAY, 0.5f, 0.25f, FALSE);
    fRow = pixBottomBound- (fNextUnit+fHalfUnit);//*_pDP->dp_fWideAdjustment;
    fCol = pixLeftBound+    fHalfUnit;
    colDefault = AddShaker( 3, fValue, penLast->m_iLastArmor, penLast->m_tmArmorChanged, fMoverX, fMoverY);
    if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
      HUD_DrawBorder( fCol+fMoverX, fRow+fMoverY, fOneUnit, fOneUnit, colBorder);
    }
    fCol += fAdvUnit+fChrUnit*3/2 -fHalfUnit;
    if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
      HUD_DrawBorder( fCol, fRow, fChrUnit*3, fOneUnit, colBorder);
      HUD_DrawText( fCol, fRow, strValue, NONE, fNormValue);
    }
    fCol -= fAdvUnit+fChrUnit*3/2 -fHalfUnit;
    if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
      if (fValue<=50.5f) {
        HUD_DrawIcon( fCol+fMoverX, fRow+fMoverY, _toArmorSmall, C_WHITE /*_colHUD*/, fNormValue, FALSE);
      } else if (fValue<=100.5f) {
        HUD_DrawIcon( fCol+fMoverX, fRow+fMoverY, _toArmorMedium, C_WHITE /*_colHUD*/, fNormValue, FALSE);
      } else {
        HUD_DrawIcon( fCol+fMoverX, fRow+fMoverY, _toArmorLarge, C_WHITE /*_colHUD*/, fNormValue, FALSE);
      }
    }
  }

   // prepare and draw shield info
  fValue = _penPlayer->m_fShield;
  BOOL bCheatsEnabled = (GetSP()->sp_ctMaxPlayers==1||GetSP()->sp_bQuickTest) && _penPlayer->m_penActionMarker==NULL;
  fValueMax=MaxShieldForPlayer(_penPlayer);
  if( fValueMax > 0.0f) {
    fNormValue = fValue/fValueMax;
    strValue.PrintF( "%d", (SLONG)ceil(fValue));
    PrepareColorTransitions( colMax, colTop, colMid, C_lGRAY, 0.5f, 0.25f, FALSE);
    fRow = pixBottomBound- (fNextUnit*2+fHalfUnit);//*_pDP->dp_fWideAdjustment;
    fCol = pixLeftBound+    fHalfUnit;
    //colDefault = AddShaker( 3, fValue, penLast->m_iLastArmor, penLast->m_tmArmorChanged, fMoverX, fMoverY);
  	if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
		  HUD_DrawBorder( fCol, fRow, fOneUnit, fOneUnit, colBorder);
      fCol += fAdvUnit+fChrUnit*3/2 -fHalfUnit;
		  HUD_DrawBorder( fCol, fRow, fChrUnit*3, fOneUnit, colBorder);
		  HUD_DrawText( fCol, fRow, strValue, NONE, fNormValue);
      fCol -= fAdvUnit+fChrUnit*3/2 -fHalfUnit;
      HUD_DrawIcon( fCol, fRow, _atoPowerups[1], C_WHITE /*_colHUD*/, fNormValue, TRUE);
    }
  }

  // prepare and draw ammo and weapon info
  CTextureObject *ptoCurrentAmmo=NULL, *ptoCurrentWeapon=NULL, *ptoWantedWeapon=NULL;
  INDEX iCurrentWeapon = _penWeapons->m_iCurrentWeapon;
  INDEX iWantedWeapon  = _penWeapons->m_iWantedWeapon;
  // determine corresponding ammo and weapon texture component
  ptoCurrentWeapon = _awiWeapons[iCurrentWeapon].wi_ptoWeapon;
  ptoWantedWeapon  = _awiWeapons[iWantedWeapon].wi_ptoWeapon;

  AmmoInfo *paiCurrent = _awiWeapons[iCurrentWeapon].wi_paiAmmo;
  if( paiCurrent!=NULL) ptoCurrentAmmo = paiCurrent->ai_ptoAmmo;

  // draw complete weapon info if knife isn't current weapon
  if( ptoCurrentAmmo!=NULL && !GetSP()->sp_bInfiniteAmmo) {
    // determine ammo quantities
    FLOAT fMaxValue = _penWeapons->GetMaxAmmo();
    fValue = _penWeapons->GetAmmo();
    fNormValue = fValue / fMaxValue;
    strValue.PrintF( "%d", (SLONG)ceil(fValue));
    PrepareColorTransitions( colMax, colTop, colMid, C_RED, 0.30f, 0.15f, FALSE);
    BOOL bDrawAmmoIcon = _fCustomScaling<=1.0f;
    // draw ammo, value and weapon
    fRow = pixBottomBound-fHalfUnit;
    fCol = 175 + fHalfUnit;
    colDefault = AddShaker( 4, fValue, penLast->m_iLastAmmo, penLast->m_tmAmmoChanged, fMoverX, fMoverY);
    if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
      HUD_DrawBorder( fCol+fMoverX, fRow+fMoverY, fOneUnit, fOneUnit, colBorder);
    }
    fCol += fAdvUnit+fChrUnit*3/2 -fHalfUnit;
    if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
      HUD_DrawBorder( fCol, fRow, fChrUnit*3, fOneUnit, colBorder);
    }
    if( bDrawAmmoIcon) {
      fCol += fAdvUnit+fChrUnit*3/2 -fHalfUnit;
      if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
        HUD_DrawBorder( fCol, fRow, fOneUnit, fOneUnit, colBorder);
        HUD_DrawIcon( fCol, fRow, *ptoCurrentAmmo, C_WHITE /*_colHUD*/, fNormValue, TRUE);
      }
      fCol -= fAdvUnit+fChrUnit*3/2 -fHalfUnit;
    }
    if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
      HUD_DrawText( fCol, fRow, strValue, NONE, fNormValue);
    }
    fCol -= fAdvUnit+fChrUnit*3/2 -fHalfUnit;
    if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
      HUD_DrawIcon( fCol+fMoverX, fRow+fMoverY, *ptoCurrentWeapon, C_WHITE /*_colHUD*/, fNormValue, !bDrawAmmoIcon);
    }
  } else if( ptoCurrentWeapon!=NULL) {
    // draw only knife or colt icons (ammo is irrelevant)
    fRow = pixBottomBound-fHalfUnit;
    fCol = 205 + fHalfUnit;
    if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
      HUD_DrawBorder( fCol, fRow, fOneUnit, fOneUnit, colBorder);
      HUD_DrawIcon(   fCol, fRow, *ptoCurrentWeapon, C_WHITE /*_colHUD*/, fNormValue, FALSE);
    }
  }


  // display all ammo infos
  INDEX i;
  FLOAT fAdv;
  COLOR colIcon, colBar;
  PrepareColorTransitions( colMax, colTop, colMid, C_RED, 0.5f, 0.25f, FALSE);
  // reduce the size of icon slightly
  _fCustomScaling = ClampDn( _fCustomScaling*0.8f, 0.5f);
  const FLOAT fOneUnitS  = fOneUnit  *0.8f;
  const FLOAT fAdvUnitS  = fAdvUnit  *0.8f;
  const FLOAT fNextUnitS = fNextUnit *0.8f;
  const FLOAT fHalfUnitS = fHalfUnit *0.8f;

  // prepare postition and ammo quantities
  fRow = pixBottomBound-fHalfUnitS;
  fCol = pixRightBound -fHalfUnitS;
  const FLOAT fBarPos = fHalfUnitS*0.7f;
  FillWeaponAmmoTables(_penWeapons);

  FLOAT fBombCount = penPlayerCurrent->m_iSeriousBombCount;
  BOOL  bBombFiring = FALSE;
  // draw serious bomb
  #define BOMB_FIRE_TIME 1.5f
  if (penPlayerCurrent->m_tmSeriousBombFired+BOMB_FIRE_TIME>_pTimer->GetLerpedCurrentTick()) {
    fBombCount++;
    if (fBombCount>3) { fBombCount = 3; }
    bBombFiring = TRUE;
  }
  if (fBombCount>0) {
    fNormValue = (FLOAT) fBombCount / 3.0f;
    COLOR colBombBorder = _colHUD;
    COLOR colBombIcon = C_WHITE;
    COLOR colBombBar = _colHUDText; if (fBombCount==1) { colBombBar = C_RED; }
    if (bBombFiring) { 
      FLOAT fFactor = (_pTimer->GetLerpedCurrentTick() - penPlayerCurrent->m_tmSeriousBombFired)/BOMB_FIRE_TIME;
      colBombBorder = LerpColor(colBombBorder, C_RED, fFactor);
      colBombIcon = LerpColor(colBombIcon, C_RED, fFactor);
      colBombBar = LerpColor(colBombBar, C_RED, fFactor);
    }
    if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
      HUD_DrawBorder( fCol,         fRow, fOneUnitS, fOneUnitS, colBombBorder);
      HUD_DrawIcon(   fCol,         fRow, _toASeriousBomb, colBombIcon, fNormValue, FALSE);
      HUD_DrawBar(    fCol+fBarPos, fRow, fOneUnitS/5, fOneUnitS-2, BO_DOWN, colBombBar, fNormValue);
    }
    // make space for serious bomb
    fCol -= fAdvUnitS;
  }

  // loop thru all ammo types
  if (!GetSP()->sp_bInfiniteAmmo) {
    for( INDEX ii=7; ii>=0; ii--) {
      i = aiAmmoRemap[ii];
      // if no ammo and hasn't got that weapon - just skip this ammo
      AmmoInfo &ai = _aaiAmmo[i];
      ASSERT( ai.ai_iAmmoAmmount>=0);
      if( ai.ai_iAmmoAmmount==0 && !ai.ai_bHasWeapon) continue;
      // display ammo info
      colIcon = C_WHITE /*_colHUD*/;
      if( ai.ai_iAmmoAmmount==0) {
        colIcon = C_mdGRAY;
        colBorder = 0x22334400;
      }
      if( ptoCurrentAmmo == ai.ai_ptoAmmo) {
        colIcon = C_WHITE; 
        colBorder = C_WHITE;
      }
      fNormValue = (FLOAT)ai.ai_iAmmoAmmount / ai.ai_iMaxAmmoAmmount;
      colBar = AddShaker( 4, ai.ai_iAmmoAmmount, ai.ai_iLastAmmoAmmount, ai.ai_tmAmmoChanged, fMoverX, fMoverY);
      if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
        HUD_DrawBorder( fCol,         fRow+fMoverY, fOneUnitS, fOneUnitS, colBorder);
        HUD_DrawIcon(   fCol,         fRow+fMoverY, *_aaiAmmo[i].ai_ptoAmmo, colIcon, fNormValue, FALSE);
        HUD_DrawBar(    fCol+fBarPos, fRow+fMoverY, fOneUnitS/5, fOneUnitS-2, BO_DOWN, colBar, fNormValue);
      }
      colBorder = _colHUD;
      // advance to next position
      fCol -= fAdvUnitS;  
    }
  }

  // draw powerup(s) if needed
  PrepareColorTransitions( colMax, colTop, colMid, C_RED, 0.66f, 0.33f, FALSE);
  TIME *ptmPowerups = (TIME*)&_penPlayer->m_tmInvisibility;
  TIME *ptmPowerupsMax = (TIME*)&_penPlayer->m_tmInvisibilityMax;
  fRow = pixBottomBound-fOneUnitS-fAdvUnitS;
  fCol = pixRightBound -fHalfUnitS;
  for( i=0; i<MAX_POWERUPS; i++)
  {
    // skip if not active
    const TIME tmDelta = ptmPowerups[i] - _tmNow;
    if( tmDelta<=0) continue;
    fNormValue = tmDelta / ptmPowerupsMax[i];
    // draw icon and a little bar
    if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
      HUD_DrawBorder( fCol,         fRow, fOneUnitS, fOneUnitS, colBorder);
      HUD_DrawIcon(   fCol,         fRow, _atoPowerups[i], C_WHITE /*_colHUD*/, fNormValue, TRUE);
      HUD_DrawBar(    fCol+fBarPos, fRow, fOneUnitS/5, fOneUnitS-2, BO_DOWN, NONE, fNormValue);
    }
    // play sound if icon is flashing
    if(fNormValue<=(_cttHUD.ctt_fLowMedium/2)) {
      // activate blinking only if value is <= half the low edge
      INDEX iLastTime = (INDEX)(_tmLast*4);
      INDEX iCurrentTime = (INDEX)(_tmNow*4);
      if(iCurrentTime&1 & !(iLastTime&1)) {
        ((CPlayer *)penPlayerCurrent)->PlayPowerUpSound();
      }
    }
    // advance to next position
    fCol -= fAdvUnitS;
  }


  // if weapon change is in progress
  _fCustomScaling = hud_fScaling;
  hud_tmWeaponsOnScreen = Clamp( hud_tmWeaponsOnScreen, 0.0f, 10.0f);   
  if( (_tmNow - _penWeapons->m_tmWeaponChangeRequired) < hud_tmWeaponsOnScreen) {
    // determine number of weapons that player has
    INDEX ctWeapons = 0;
    for( i=WEAPON_NONE+1; i<WEAPON_LAST; i++) {
      if( _awiWeapons[i].wi_wtWeapon!=WEAPON_NONE && _awiWeapons[i].wi_wtWeapon!=WEAPON_DOUBLECOLT &&
          _awiWeapons[i].wi_bHasWeapon) ctWeapons++;
    }
    // display all available weapons
    fRow = pixBottomBound - fHalfUnit - 3*fNextUnit;
    fCol = 320.0f - (ctWeapons*fAdvUnit-fHalfUnit)/2.0f;
    // display all available weapons
    for( INDEX ii=WEAPON_NONE+1; ii<WEAPON_LAST; ii++) {
      i = aiWeaponsRemap[ii];
      // skip if hasn't got this weapon
      if( _awiWeapons[i].wi_wtWeapon==WEAPON_NONE || _awiWeapons[i].wi_wtWeapon==WEAPON_DOUBLECOLT
         || !_awiWeapons[i].wi_bHasWeapon) continue;
      // display weapon icon
      COLOR colBorder = _colHUD;
      colIcon = 0xccddff00;
      // weapon that is currently selected has different colors
      if( ptoWantedWeapon == _awiWeapons[i].wi_ptoWeapon) {
        colIcon = 0xffcc0000;
        colBorder = 0xffcc0000;
      }
      // no ammo
      if( _awiWeapons[i].wi_paiAmmo!=NULL && _awiWeapons[i].wi_paiAmmo->ai_iAmmoAmmount==0) {
        if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD>=1) {
          HUD_DrawBorder( fCol, fRow, fOneUnit, fOneUnit, 0x22334400);
          HUD_DrawIcon(   fCol, fRow, *_awiWeapons[i].wi_ptoWeapon, 0x22334400, 1.0f, FALSE);
        }
      // yes ammo
      } else {
        if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD>=1) {
          HUD_DrawBorder( fCol, fRow, fOneUnit, fOneUnit, colBorder);
          HUD_DrawIcon(   fCol, fRow, *_awiWeapons[i].wi_ptoWeapon, colIcon, 1.0f, FALSE);
        }
      }
      // advance to next position
      fCol += fAdvUnit;
    }
  }


  // reduce icon sizes a bit
  const FLOAT fUpperSize = ClampDn(_fCustomScaling*0.5f, 0.5f)/_fCustomScaling;
  _fCustomScaling*=fUpperSize;
  ASSERT( _fCustomScaling>=0.5f);
  fChrUnit  *= fUpperSize;
  fOneUnit  *= fUpperSize;
  fHalfUnit *= fUpperSize;
  fAdvUnit  *= fUpperSize;
  fNextUnit *= fUpperSize;

  // draw oxygen info if needed
  BOOL bOxygenOnScreen = FALSE;
  fValue = _penPlayer->en_tmMaxHoldBreath - (_pTimer->CurrentTick() - _penPlayer->en_tmLastBreathed);
  if( _penPlayer->IsConnected() && (_penPlayer->GetFlags()&ENF_ALIVE) && fValue<30.0f) { 
    // prepare and draw oxygen info
    fRow = pixTopBound + fOneUnit + fNextUnit;
    fCol = 280.0f;
    fAdv = fAdvUnit + fOneUnit*4/2 - fHalfUnit;
    PrepareColorTransitions( colMax, colTop, colMid, C_RED, 0.5f, 0.25f, FALSE);
    fNormValue = fValue/30.0f;
    fNormValue = ClampDn(fNormValue, 0.0f);
    if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD>=1) {
      HUD_DrawBorder( fCol,      fRow, fOneUnit,         fOneUnit, colBorder);
      HUD_DrawBorder( fCol+fAdv, fRow, fOneUnit*4,       fOneUnit, colBorder);
      HUD_DrawBar(    fCol+fAdv, fRow, fOneUnit*4*0.975, fOneUnit*0.9375, BO_LEFT, NONE, fNormValue);
      HUD_DrawIcon(   fCol,      fRow, _toOxygen, C_WHITE /*_colHUD*/, fNormValue, TRUE);
    }
    bOxygenOnScreen = TRUE;
  }

  // draw boss energy if needed
  if( _penPlayer->m_penMainMusicHolder!=NULL) {
    CMusicHolder &mh = (CMusicHolder&)*_penPlayer->m_penMainMusicHolder;
    fNormValue = 0;

    if( mh.m_penBoss!=NULL && (mh.m_penBoss->en_ulFlags&ENF_ALIVE)) {
      CEnemyBase &eb = (CEnemyBase&)*mh.m_penBoss;
      ASSERT( eb.m_fMaxHealth>0);
      fValue = eb.GetHealth();
      fNormValue = fValue/eb.m_fMaxHealth;
    }
    if( mh.m_penCounter!=NULL) {
      CEnemyCounter &ec = (CEnemyCounter&)*mh.m_penCounter;
      if (ec.m_iCount>0) {
        fValue = ec.m_iCount;
        fNormValue = fValue/ec.m_iCountFrom;
      }
    }
    if( fNormValue>0) {
      // prepare and draw boss energy info
      //PrepareColorTransitions( colMax, colTop, colMid, C_RED, 0.5f, 0.25f, FALSE);
      PrepareColorTransitions( colMax, colMax, colTop, C_RED, 0.5f, 0.25f, FALSE);
      
      fRow = pixTopBound + fOneUnit + fNextUnit;
      fCol = 184.0f;
      fAdv = fAdvUnit+ fOneUnit*16/2 -fHalfUnit;
      if( bOxygenOnScreen) fRow += fNextUnit;
      if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD>=1) {
        HUD_DrawBorder( fCol,      fRow, fOneUnit,          fOneUnit, colBorder);
        HUD_DrawBorder( fCol+fAdv, fRow, fOneUnit*16,       fOneUnit, colBorder);
        HUD_DrawBar(    fCol+fAdv, fRow, fOneUnit*16*0.995, fOneUnit*0.9375, BO_LEFT, NONE, fNormValue);
        HUD_DrawIcon(   fCol,      fRow, _toHealth, C_WHITE /*_colHUD*/, fNormValue, FALSE);
      }
    }
  }


  // determine scaling of normal text and play mode
  const FLOAT fTextScale  = (_fResolutionScaling+1) *0.5f;
  const BOOL bSinglePlay  =  GetSP()->sp_bSinglePlayer;
  const BOOL bCooperative =  GetSP()->sp_bCooperative && !bSinglePlay;
  const BOOL bScoreMatch  = !GetSP()->sp_bCooperative && !GetSP()->sp_bUseFrags;
  const BOOL bFragMatch   = !GetSP()->sp_bCooperative &&  GetSP()->sp_bUseFrags;
  COLOR colMana, colFrags, colDeaths, colHealth, colArmor, colLatency;
  COLOR colScore  = _colHUD;
  INDEX iScoreSum = 0;
  INDEX iScoreNextCredit = 0;

  CTString strGameMode, strGameDifficulty;

  switch (GetSP()->sp_gmGameMode) {
	case -1: strGameMode = TRANS("Flyover");     break;
	case  0: strGameMode = TRANS("Cooperative"); break;
	case  1: strGameMode = TRANS("Scorematch");  break;
	case  2: strGameMode = TRANS("Fragmatch");   break;
  case  3: strGameMode = TRANS("Survival co-op");   break;
  }

  switch (GetSP()->sp_gdGameDifficulty) {
	case -1: strGameDifficulty = TRANS("Tourist"); break;
	case  0: strGameDifficulty = TRANS("Easy")   ; break;
	case  1: strGameDifficulty = TRANS("Normal") ; break;
	case  2: strGameDifficulty = TRANS("Hard")   ; break;
	case  3: strGameDifficulty = TRANS("Serious"); break;
  }

  if (bSinglePlay) {
	  strGameMode = TRANS("Singleplayer");
  }

  if(/* !bSinglePlay*/true)
  {
    // set font and prepare font parameters
    _pfdDisplayFont->SetVariableWidth();
    _pDP->SetFont( _pfdDisplayFont);
    _pDP->SetTextScaling( fTextScale);
    FLOAT fCharHeight = (_pfdDisplayFont->GetHeight()-2)*fTextScale;
    // generate and sort by mana list of active players
    BOOL bMaxScore=TRUE, bMaxMana=TRUE, bMaxFrags=TRUE, bMaxDeaths=TRUE;
    hud_iSortPlayers = Clamp( hud_iSortPlayers, -1L, 6L);
    SortKeys eKey = (SortKeys)hud_iSortPlayers;
    if (hud_iSortPlayers==-1) {
           if (bCooperative) eKey = PSK_HEALTH;
      else if (bScoreMatch)  eKey = PSK_SCORE;
      else if (bFragMatch)   eKey = PSK_FRAGS;
      else { ASSERT(FALSE);  eKey = PSK_NAME; }
    }
    if( bCooperative) eKey = (SortKeys)Clamp( (INDEX)eKey, 0L, 3L);
    if( eKey==PSK_HEALTH && (bScoreMatch || bFragMatch)) { eKey = PSK_NAME; }; // prevent health snooping in deathmatch
    INDEX iPlayers = SetAllPlayersStats(eKey);
	  // for each player
    PlayerStats psSquadLevel = PlayerStats();
    {for( INDEX iPlayer=0; iPlayer<iPlayers; iPlayer++) {
      CPlayer *penPlayer = _apenPlayers[iPlayer];
      // add values to squad stats
      ASSERT( penPlayer!=NULL);
      PlayerStats psLevel = penPlayer->m_psLevelStats;
      PlayerStats psGame  = penPlayer->m_psGameStats ;
      psSquadLevel.ps_iScore   += psLevel.ps_iScore   ;
      psSquadLevel.ps_iKills   += psLevel.ps_iKills   ;
      psSquadLevel.ps_iDeaths  += psLevel.ps_iDeaths  ;
      psSquadLevel.ps_iSecrets += psLevel.ps_iSecrets ;
    }}

	  const INDEX iDeaths  = _penPlayer->m_psGameStats.ps_iDeaths;
	  if (_penPlayer->m_penGameStat==NULL) {return;}
    CGameStat &gs = (CGameStat&)*_penPlayer->m_penGameStat;
	  INDEX iTimerCD = -1;
	  INDEX iHUDTimerCD = -1;
	  iTimerCD = gs.m_fLevelTime + GetSP()->sp_fForceSpectateCD;
	  iHUDTimerCD = iTimerCD - _pTimer->CurrentTick();

    if (GetSP()->sp_bIncrementCredit/*GetSP()->sp_gmGameMode==3*/) {
      iScoreNextCredit = gs.GetNextMilestonePoints() - gs.m_iLevelScore;
    }

	  CTString strSecrets, strKills, strSessionTime, strDeaths, strCredits, strMaxCredits, strEnemyStrength, strCoopRespawnCDLeft, strScoreNextCredit;
    if (gs.m_iEnemyCount >= _penPlayer->m_psLevelTotal.ps_iKills) {
	    strKills.PrintF("^c6cff6c%i / %i", gs.m_iEnemyCount,  _penPlayer->m_psLevelTotal.ps_iKills);
    } else {
      strKills.PrintF("%i / %i", gs.m_iEnemyCount,  _penPlayer->m_psLevelTotal.ps_iKills);
    }
    if (gs.m_iSecretCount >= _penPlayer->m_psLevelTotal.ps_iSecrets) {
	    strSecrets.PrintF("^c6cff6c%i / %i", gs.m_iSecretCount, _penPlayer->m_psLevelTotal.ps_iSecrets);
    } else {
      strSecrets.PrintF("%i / %i", gs.m_iSecretCount, _penPlayer->m_psLevelTotal.ps_iSecrets);
    }
	  strDeaths.PrintF( "%d",  iDeaths);

    if (GetSP()->sp_bIncrementCredit/*GetSP()->sp_gmGameMode==CSessionProperties::GM_SURVIVALCOOP*/) {
      strCredits.PrintF("%d", GetSP()->sp_ctCreditsLeft);
    } else {
      strCredits.PrintF("%d / %d", GetSP()->sp_ctCreditsLeft, GetSP()->sp_ctCredits);
    }
        
    //_penPlayer->m_tmLevelStarted = _pNetwork->GetGameTime();
    strSessionTime.PrintF("%s", TimeToString(_pNetwork->GetGameTime()));
	  strGameMode.PrintF("%s - %s", strGameMode, strGameDifficulty);
    strCoopRespawnCDLeft.PrintF("%i", iHUDTimerCD);
	  //strLevelScore.PrintF("%i", mh.m_iLevelScore);
	  INDEX iEnemyStrengthPercent = 100 + (GetSP()->sp_fExtraEnemyStrength + GetSP()->sp_fExtraEnemyStrengthPerPlayer * _pNetwork->ga_sesSessionState.GetPlayersCount()) * 100;
	  strEnemyStrength.PrintF("%i%s", iEnemyStrengthPercent, "%");
    strScoreNextCredit.PrintF("%i", iScoreNextCredit);
	  
	  INDEX iAmmoXPosition = 350;
	  INDEX iTimeXPosition = -150;

	  if( hud_iShowPlayers==1 || hud_iShowPlayers==-1 /*&& !bSinglePlay*/ && _penPlayer->m_bShowingTabInfo) {
          // printout location and info aren't the same for deathmatch and coop play
		  const FLOAT fCharWidth = (PIX)((_pfdDisplayFont->GetWidth()-2) *fTextScale);
		  DIO_DrawBcg( ESP_Middle,    0,            ESP_Middle,    0, ESP_Middle, 1280, ESP_Middle, 900, 0x00000080); // table background
		  DIO_DrawBcg( ESP_Middle,    0,            ESP_Middle, -355, ESP_Middle, 1240, ESP_Middle,   4, 0xFFFFFF80); // caption line
		  DIO_DrawBcg( ESP_Middle,    0,            ESP_Middle,  360, ESP_Middle, 1240, ESP_Middle,   4, 0xFFFFFF80); // stats line

		  DIO_DrawText(ESP_Middle,    0,            ESP_Middle, -400, TranslateConst(_penPlayer->en_pwoWorld->GetName(), 0),    2, ESP_Middle,  C_WHITE); //map name

		  if( bFragMatch || bScoreMatch) {
			  iTimeXPosition = -350;
		  } else {
        iTimeXPosition = -150;}
		  DIO_DrawText(ESP_Middle, iTimeXPosition,  ESP_Middle,  405, TRANS("Time"),  2, ESP_Middle,  C_WHITE); //elapsed time
		  DIO_DrawText(ESP_Middle, iTimeXPosition,  ESP_Middle,  440, strSessionTime, 2, ESP_Middle,  C_WHITE);
		  DIO_DrawText(ESP_Middle,    0,            ESP_Middle, -365, strGameMode,    2, ESP_Middle, _colHUD);

		  DIO_DrawText(ESP_Middle, -570,            ESP_Middle, -315, TRANS("Ping"),        2, ESP_Middle, _colHUD);

		  if( bCooperative || bSinglePlay) {
			  DIO_DrawText(ESP_Middle, -310,          ESP_Middle, -315, TRANS("Player"),      2, ESP_Middle, _colHUD); // table captions
			  DIO_DrawText(ESP_Middle,  -50,          ESP_Middle, -315, TRANS("Health"),      2, ESP_Middle, _colHUD);
			  DIO_DrawText(ESP_Middle,   50,          ESP_Middle, -315, TRANS("Armor"),       2, ESP_Middle, _colHUD);

			  if (!_penPlayer->m_bShopInTheWorld) {
          if (bCooperative) {
            DIO_DrawText(ESP_Middle,  150,      ESP_Middle, -315, TRANS("Deaths"),      2, ESP_Middle, _colHUD);
          }
				  } else {
				  DIO_DrawText(ESP_Middle,  150,        ESP_Middle, -315, TRANS("Money"),       2, ESP_Middle, _colHUD);
			  }
        if (!GetSP()->sp_bInfiniteAmmo) {
          DIO_DrawText(ESP_Middle,  iAmmoXPosition, ESP_Middle, -315, TRANS("Ammo"),    2, ESP_Middle, _colHUD);
        }
        if (bCooperative) {
          DIO_DrawText(ESP_Middle,  555,      ESP_Middle, -315, TRANS("Distance"),    2, ESP_Middle, _colHUD);
        }
			  
        if (GetSP()->sp_bFriendlyFire && GetSP()->sp_bCooperative) {                                           // stats captions
				  DIO_DrawText(ESP_Middle, -500,        ESP_Middle,  405, TRANS("^cff9900Friendly"),   2, ESP_Middle, C_WHITE); // friendly fire
				  DIO_DrawText(ESP_Middle, -500,        ESP_Middle,  440, TRANS("^cff9900fire"),       2, ESP_Middle, C_WHITE);
			  }

			  if (iEnemyStrengthPercent > 100) {
				  DIO_DrawText(ESP_Middle, -300,        ESP_Middle,  405, TRANS("Enemy strength"),     2, ESP_Middle, C_WHITE); // Enemy strength
				  DIO_DrawText(ESP_Middle, -300,        ESP_Middle,  440, strEnemyStrength,     2, ESP_Middle, C_WHITE);
			  }
			  DIO_DrawText(ESP_Middle,    0,          ESP_Middle,  405, TRANS("Kills"),       2, ESP_Middle, C_WHITE); //kills
			  DIO_DrawText(ESP_Middle,    0,          ESP_Middle,  440, strKills,             2, ESP_Middle, C_WHITE);
			  DIO_DrawText(ESP_Middle,  150,          ESP_Middle,  405, TRANS("Secrets"),     2, ESP_Middle, C_WHITE); //secrets
			  DIO_DrawText(ESP_Middle,  150,          ESP_Middle,  440, strSecrets,           2, ESP_Middle, C_WHITE);
			  if (bCooperative) {
          if (GetSP()->sp_bIncrementCredit/*GetSP()->sp_gmGameMode==3*/) {
				    DIO_DrawText(ESP_Middle,  300,      ESP_Middle,  405, TRANS("Goal"),       2, ESP_Middle, C_WHITE); //credits left for extra life
            if (iScoreNextCredit<=25000000)  {
				      DIO_DrawText(ESP_Middle,  300,      ESP_Middle,  440, strScoreNextCredit,  2, ESP_Middle, C_WHITE);
            }
          } else {
				    DIO_DrawText(ESP_Middle,  300,      ESP_Middle,  405, TRANS("Deaths"),     2, ESP_Middle, C_WHITE); //deaths
				    DIO_DrawText(ESP_Middle,  300,      ESP_Middle,  440, strDeaths,           2, ESP_Middle, C_WHITE);
          }
			  }
			  if (GetSP()->sp_ctCredits!=-1 && bCooperative) {
				  DIO_DrawText(ESP_Middle,  450,        ESP_Middle,  405, TRANS("Credits"),      2, ESP_Middle, C_WHITE); //respawn credits
				  if (GetSP()->sp_ctCredits==0) {
				  DIO_DrawText(ESP_Middle,  450,        ESP_Middle,  440, TRANS("^cff9900None"), 2, ESP_Middle, C_WHITE); //no respawn - no count
				  } else {
				  DIO_DrawText(ESP_Middle,  450,        ESP_Middle,  440, strCredits, 2, ESP_Middle, C_WHITE);
				  }
			  }

        if (_penWeapons->m_fAmmoPackExtra >= 0.5f && _penWeapons->m_fAmmoPackExtra < 0.55f){
          DIO_DrawIcon(ESP_Middle,  570,        ESP_Middle,  405, _toCustomBP,  0, C_WHITE);
        } else if (_penWeapons->m_fAmmoPackExtra >= 0.55f){
          DIO_DrawIcon(ESP_Middle,  570,        ESP_Middle,  405, _toSeriousBP, 0, C_WHITE);
        }

			  if (GetSP()->sp_ctCredits!=-1 && bCooperative && iHUDTimerCD>0) {
				  DIO_DrawText(ESP_Middle,  570,        ESP_Middle, -400, strCoopRespawnCDLeft, 2, ESP_Middle, C_WHITE);  //Penalty timer in the co-op game with respawns
			  }
			  /*if (GetSP()->sp_ctCredits!=-1 && bCooperative) {
				  DIO_DrawText(ESP_Middle,  570,        ESP_Middle, -370, strLevelScore,        2, ESP_Middle, C_WHITE);  //Score of current level
			  }*/

		  } else if( bScoreMatch) {
			  DIO_DrawText(ESP_Middle, -150,          ESP_Middle, -315, TRANS("Player"),      2, ESP_Middle, _colHUD); // captions for deathmatch mode
			  DIO_DrawText(ESP_Middle,  400,          ESP_Middle, -315, TRANS("Score"),       2, ESP_Middle, _colHUD);
			  DIO_DrawText(ESP_Middle,  550,          ESP_Middle, -315, TRANS("Value"),       2, ESP_Middle, _colHUD);
		  } else { // fragmatch!
			  DIO_DrawText(ESP_Middle, -150,          ESP_Middle, -315, TRANS("Player"),      2, ESP_Middle, _colHUD);
			  DIO_DrawText(ESP_Middle,  400,          ESP_Middle, -315, TRANS("Frags"),       2, ESP_Middle, _colHUD);
			  DIO_DrawText(ESP_Middle,  550,          ESP_Middle, -315, TRANS("Deaths"),      2, ESP_Middle, _colHUD);		 
		  }
	  }

    for( INDEX i=0; i<iPlayers; i++)
    { // get player name and mana
      CPlayer *penPlayer = _apenPlayers[i];
	  
	  if (penPlayer->m_penWeapons == NULL) {continue;}
	  FillWeaponAmmoTables(penPlayer->GetPlayerWeapons());
	  BOOL bCurrentPlayer = penPlayer->GetPlayerName().GetHash() == ((CPlayer*)&*_penPlayer)->GetPlayerName().GetHash();
      const CTString strName = penPlayer->GetPlayerName();
      const INDEX      iMoney   = penPlayer->m_iMoney;
      const INDEX      iScore   = penPlayer->m_psGameStats.ps_iScore;
      const INDEX      iMana    = penPlayer->m_iMana;
      const INDEX      iFrags   = penPlayer->m_psGameStats.ps_iKills;
      const INDEX      iDeaths  = penPlayer->m_psGameStats.ps_iDeaths;
      const INDEX      iHealth  = ClampDn( (INDEX)ceil( penPlayer->GetHealth()), 0L);
      const INDEX      iArmor   = ClampDn( (INDEX)ceil( penPlayer->m_fArmor),    0L);
      const INDEX      iShield  = ClampDn( (INDEX)ceil( penPlayer->m_fShield),   0L);
      const INDEX      iAmmo    = penPlayer->GetPlayerWeapons()->GetAmmo();
	          INDEX      iLatency = ceil(penPlayer->en_tmPing*1000.0f);
			      INDEX      iListValuePosY    = -275+(40*i);
			
      CTString strScore, strMana, strFrags, strDeaths, strHealth, strArmor, strShield, strMoney, strAmmo, strLatency, strDistance;
         strScore.PrintF("%d",  iScore  );
          strMana.PrintF("%d",  iMana   );
         strFrags.PrintF("%d",  iFrags  );
        strDeaths.PrintF("%d",  iDeaths );
        strHealth.PrintF("%d",  iHealth );
         strArmor.PrintF("%d",  iArmor  );
        strShield.PrintF("%d (%d)",  iArmor, iShield  );
          strAmmo.PrintF("%d",  iAmmo   );
         strMoney.PrintF("%i$", iMoney  );
       strLatency.PrintF("%i",  iLatency);
      strDistance.PrintF("%i",  (INDEX)(_penPlayer->GetPlacement().pl_PositionVector - penPlayer->GetPlacement().pl_PositionVector).Length());
	  
      // determine corresponding colors
      colHealth  = C_mlRED;
      colLatency = C_mlRED;
      colMana    = colScore = colFrags = colDeaths = colArmor = C_lGRAY;
      if( iMana   > _penPlayer->m_iMana)                      { bMaxMana   = FALSE; colMana   = C_WHITE; }
      if( iScore  > _penPlayer->m_psGameStats.ps_iScore)      { bMaxScore  = FALSE; colScore  = C_WHITE; }
      if( iFrags  > _penPlayer->m_psGameStats.ps_iKills)      { bMaxFrags  = FALSE; colFrags  = C_WHITE; }
      if( iDeaths > _penPlayer->m_psGameStats.ps_iDeaths)     { bMaxDeaths = FALSE; colDeaths = C_WHITE; }

      // hitrowski was here
      if (bCurrentPlayer) {
        colScore = colMana = colFrags = colDeaths = _colHUD; // current player
      }
      if( iHealth>25)  colHealth  = _colHUD;
      if( iArmor >25)  colArmor   = _colHUD;
      if( iLatency  <150) {colLatency = _colHUD;} else if (iLatency <300) {colLatency = C_WHITE;} else {colLatency = C_mlRED;}
      // eventually print it out

      if( hud_iShowPlayers==1 || hud_iShowPlayers==-1 /*&& !bSinglePlay*/ && _penPlayer->m_bShowingTabInfo) {
        // printout location and info aren't the same for deathmatch and coop play
        const FLOAT fCharWidth = (PIX)((_pfdDisplayFont->GetWidth()-2) *fTextScale);

	      INDEX iLineHeight = 40;
		    if (bCurrentPlayer) {
			    DIO_DrawBcg( ESP_Middle,    0, ESP_Middle, -295+(40*i), ESP_Middle, 1240, ESP_Middle, iLineHeight, 0xFFFFFF40); //current player
			  }

        if( bCooperative || bSinglePlay) {

			// * Render scoreboard **********************************************************************
		
			    if (!GetSP()->sp_bInfiniteAmmo) { //Render Ammo info for each player
				  const INDEX iAmmoTypesTotal = 7;
				  INDEX iCurrentAmmoTypesCount = 0;

 				  // count available ammo types for center align
				  for( INDEX bb=0; bb<=iAmmoTypesTotal; bb++) {
				    // if no ammo and hasn't got that weapon - just skip this ammo
				    AmmoInfo &ai = _aaiAmmo[bb];
				    if( ai.ai_iAmmoAmmount==0 && !ai.ai_bHasWeapon) continue;

				    iCurrentAmmoTypesCount++;
				  }
 
				INDEX iAmmoIndex = 0;
				for( INDEX ii=iAmmoTypesTotal; ii>=0; ii--) {
				  INDEX iAmmoType = aiAmmoRemap[ii];
				  // if no ammo and hasn't got that weapon - just skip this ammo
				  AmmoInfo &ai = _aaiAmmo[iAmmoType];
				  ASSERT( ai.ai_iAmmoAmmount>=0);
				  if( ai.ai_iAmmoAmmount==0 && !ai.ai_bHasWeapon) continue;
				  // display ammo info
				  colIcon = C_WHITE;
				  if( ai.ai_iAmmoAmmount==0) colIcon = C_mdGRAY; else
				  if( ptoCurrentAmmo == ai.ai_ptoAmmo) colIcon = C_WHITE; 
				  fNormValue = (FLOAT)ai.ai_iAmmoAmmount / ai.ai_iMaxAmmoAmmount;

				  CTextureData* ctoAmmo = (CTextureData*)_aaiAmmo[iAmmoType].ai_ptoAmmo->GetData();
				  
				  const FLOAT fAmmoWidth  = ctoAmmo->GetPixWidth();
				  const FLOAT fAmmoHeight = ctoAmmo->GetPixHeight();

				  
				  FLOAT fAmmoBarWidth =  fAmmoWidth - (fAmmoWidth/1.25f);
				  FLOAT fAmmoBarHeight = fAmmoHeight*fNormValue;


				  const float fIndent = 1.15f;

				  INDEX iAmmoIconX = iAmmoXPosition - fAmmoWidth/2 + ((iCurrentAmmoTypesCount * fIndent * fAmmoWidth) / 2) - (iAmmoIndex*fAmmoWidth*fIndent);
				  INDEX iAmmoIconY = iListValuePosY-(iLineHeight/2);

				  PrepareColorTransitions( colMax, colTop, colMid, C_RED, 0.5f, 0.25f, FALSE);
				  DIO_DrawIcon(ESP_Middle,  iAmmoIconX, ESP_Middle, iAmmoIconY, *_aaiAmmo[iAmmoType].ai_ptoAmmo, 0, colIcon);
				  DIO_DrawBcg( ESP_Middle,  iAmmoIconX + fAmmoWidth/2, ESP_Middle, iAmmoIconY + fAmmoHeight/2.0f, 
				  ESP_Middle, fAmmoBarWidth, ESP_Start, -fAmmoBarHeight, GetCurrentColor(fNormValue)|_ulAlphaHUD);  
				  
				  iAmmoIndex++;
				}
			}
      if (GetSP()->sp_gmGameMode==CSessionProperties::GM_SURVIVALCOOP){
        CPlayerWeapons* penCurrentWeapons=(CPlayerWeapons*)penPlayer->m_penWeapons.ep_pen;
        if (penCurrentWeapons->m_fAmmoPackExtra >= 0.5f && penCurrentWeapons->m_fAmmoPackExtra < 0.55f){
          DIO_DrawIcon(ESP_Middle,  -105, ESP_Middle, iListValuePosY-19, _toCustomBP32,  0, C_WHITE);
        } else if (penCurrentWeapons->m_fAmmoPackExtra >= 0.55f){
          DIO_DrawIcon(ESP_Middle,  -105, ESP_Middle, iListValuePosY-19, _toSeriousBP32, 0, C_WHITE);
        }
      }
         
			DIO_DrawText(ESP_Middle, -570, ESP_Middle, iListValuePosY, strLatency, 2, ESP_Middle, colLatency |_ulAlphaHUD); // values
			DIO_DrawText(ESP_Middle, -310, ESP_Middle, iListValuePosY, strName,    2, ESP_Middle, colScore   |_ulAlphaHUD);
			DIO_DrawText(ESP_Middle,  -50, ESP_Middle, iListValuePosY, strHealth,  2, ESP_Middle, colHealth  |_ulAlphaHUD);
			DIO_DrawText(ESP_Middle,    0, ESP_Middle, iListValuePosY, "/",        2, ESP_Middle, colScore   |_ulAlphaHUD);
      if (MaxShieldForPlayer(_penPlayer)>0) {
        DIO_DrawText(ESP_Middle,   60, ESP_Middle, iListValuePosY, strShield,  2, ESP_Middle, colArmor   |_ulAlphaHUD);
      } else {
        DIO_DrawText(ESP_Middle,   50, ESP_Middle, iListValuePosY, strArmor,   2, ESP_Middle, colArmor   |_ulAlphaHUD);
      }
			
      if (bCooperative) {  // If there is a Shop in the level, each player's balance is shown instead of the number of deaths
        if (!_penPlayer->m_bShopInTheWorld){
			    DIO_DrawText(ESP_Middle,  150, ESP_Middle, iListValuePosY, strDeaths,  2, ESP_Middle, colScore   |_ulAlphaHUD);
			    } else {
			    DIO_DrawText(ESP_Middle,  150, ESP_Middle, iListValuePosY, strMoney,   2, ESP_Middle, colScore   |_ulAlphaHUD);
			  }
      }

      if (bSinglePlay && _penPlayer->m_bShopInTheWorld){  // For classic hud purposes
			    DIO_DrawText(ESP_Middle,  150, ESP_Middle, iListValuePosY, strMoney,   2, ESP_Middle, colScore   |_ulAlphaHUD);
      }

      if (!bCurrentPlayer) { // Mark the current player in the table
			  DIO_DrawText(ESP_Middle,  555, ESP_Middle, iListValuePosY, strDistance, 2, ESP_Middle, colScore  |_ulAlphaHUD);
			  DIO_DrawIcon(ESP_Middle,  605, ESP_Middle, iListValuePosY-22, _toPointer, GetAngleFromTo(_penPlayer, penPlayer), C_WHITE);
			}

      } else if( bScoreMatch) { // Show data for deathmatch mode
			  DIO_DrawText(ESP_Middle, -570, ESP_Middle, iListValuePosY, strLatency, 2, ESP_Middle, colLatency |_ulAlphaHUD); // values
			  DIO_DrawText(ESP_Middle, -150, ESP_Middle, iListValuePosY, strName,    2, ESP_Middle, _colHUD    |_ulAlphaHUD);
			  DIO_DrawText(ESP_Middle,  400, ESP_Middle, iListValuePosY, strScore,   2, ESP_Middle, colScore   |_ulAlphaHUD);
			  DIO_DrawText(ESP_Middle,  475, ESP_Middle, iListValuePosY, "/",        2, ESP_Middle, _colHUD    |_ulAlphaHUD);
			  DIO_DrawText(ESP_Middle,  550, ESP_Middle, iListValuePosY, strMana,    2, ESP_Middle, colMana    |_ulAlphaHUD);
      } else { // fragmatch!
			  DIO_DrawText(ESP_Middle, -570, ESP_Middle, iListValuePosY, strLatency, 2, ESP_Middle, colLatency |_ulAlphaHUD); // values
			  DIO_DrawText(ESP_Middle, -150, ESP_Middle, iListValuePosY, strName,    2, ESP_Middle, _colHUD    |_ulAlphaHUD);
			  DIO_DrawText(ESP_Middle,  400, ESP_Middle, iListValuePosY, strFrags,   2, ESP_Middle, colFrags   |_ulAlphaHUD);
			  DIO_DrawText(ESP_Middle,  475, ESP_Middle, iListValuePosY, "/",        2, ESP_Middle, _colHUD    |_ulAlphaHUD);
			  DIO_DrawText(ESP_Middle,  550, ESP_Middle, iListValuePosY, strDeaths,  2, ESP_Middle, colDeaths  |_ulAlphaHUD);		 
			}
		}
	
    }

    // draw remaining time if time based death- or scorematch
    if ((bScoreMatch || bFragMatch) && hud_bShowMatchInfo){
      CTString strLimitsInfo="";  
      if (GetSP()->sp_iTimeLimit>0 && _penPlayer->m_bShowingTabInfo) {
        FLOAT fTimeLeft = ClampDn(GetSP()->sp_iTimeLimit*60.0f - _pNetwork->GetGameTime(), 0.0f);
        //strLimitsInfo.PrintF("%s^cFFFFFF%s: %s\n", strLimitsInfo, TRANS("TIME LEFT"), TimeToString(fTimeLeft));
		    DIO_DrawText(ESP_Middle, 350, ESP_Middle, 405, TRANS("TIME LEFT"),      2, ESP_Middle, C_WHITE); //time left
		    DIO_DrawText(ESP_Middle, 350, ESP_Middle, 440, TimeToString(fTimeLeft), 2, ESP_Middle, C_WHITE);
      }
      extern INDEX SetAllPlayersStats( INDEX iSortKey);
      // fill players table
      const INDEX ctPlayers = SetAllPlayersStats(bFragMatch?5:3); // sort by frags or by score
      // find maximum frags/score that one player has
      INDEX iMaxFrags = LowerLimit(INDEX(0));
      INDEX iMaxScore = LowerLimit(INDEX(0));
      {for(INDEX iPlayer=0; iPlayer<ctPlayers; iPlayer++) {
        CPlayer *penPlayer = _apenPlayers[iPlayer];
        iMaxFrags = Max(iMaxFrags, penPlayer->m_psLevelStats.ps_iKills);
        iMaxScore = Max(iMaxScore, penPlayer->m_psLevelStats.ps_iScore);
      }}

	  if (_penPlayer->m_bShowingTabInfo) {
		  if (GetSP()->sp_iFragLimit>0) {
			  CTString strFragsLeft(0, "%i", ClampDn(GetSP()->sp_iFragLimit-iMaxFrags, INDEX(0)));
			  DIO_DrawText(ESP_Middle, 0, ESP_Middle, 405, TRANS("FRAGS LEFT"),    2, ESP_Middle, C_WHITE); //frags left
			  DIO_DrawText(ESP_Middle, 0, ESP_Middle, 440, strFragsLeft,    2, ESP_Middle, C_WHITE);
		    }
		  if (GetSP()->sp_iScoreLimit>0) {
			  CTString strScoreLeft(0, "%i", ClampDn(GetSP()->sp_iScoreLimit-iMaxScore, INDEX(0)));
			  DIO_DrawText(ESP_Middle, 0, ESP_Middle, 405, TRANS("SCORE LEFT"),     2, ESP_Middle, C_WHITE); //score left
			  DIO_DrawText(ESP_Middle, 0, ESP_Middle, 440, strScoreLeft, 2, ESP_Middle, C_WHITE);
		  }
	  }


      _pfdDisplayFont->SetFixedWidth();
      _pDP->SetFont( _pfdDisplayFont);
      _pDP->SetTextScaling( fTextScale*0.8f );
      _pDP->SetTextCharSpacing( -2.0f*fTextScale);
      _pDP->PutText( strLimitsInfo, 5.0f*_pixDPWidth/640.0f, 48.0f*_pixDPWidth/640.0f, C_WHITE|CT_OPAQUE);
    }
        

    // prepare color for local player printouts
    bMaxScore  ? colScore  = C_WHITE : colScore  = C_lGRAY;
    bMaxMana   ? colMana   = C_WHITE : colMana   = C_lGRAY;
    bMaxFrags  ? colFrags  = C_WHITE : colFrags  = C_lGRAY;
    bMaxDeaths ? colDeaths = C_WHITE : colDeaths = C_lGRAY;
  }

      // Additional interface for spectator mode
  CPlayer* penPlayer1 = (CPlayer*)&*_penPlayer;
  if (penPlayer1->IsPredictor()) {
    penPlayer1=((CPlayer*)&*penPlayer1->GetPredicted());
  }
  CPlayer* penPlayer2 = (CPlayer*)penPlayer1->m_penSpectatorPlayer.ep_pen;
  if (penPlayer1!=penPlayer2 && !_pNetwork->IsPlayerLocal(penPlayer1)) {
    CTString strPlayerName = ((CPlayer*)&*_penPlayer)->GetPlayerName();
    strPlayerName.PrintF("%s", strPlayerName);

    _pfdDisplayFont->SetFixedWidth();
    _pDP->SetFont( _pfdDisplayFont);
    _pDP->SetTextScaling( fTextScale*1.0f );
    _pDP->SetTextCharSpacing( -4.0f*fTextScale);
    _pDP->PutTextC( TRANS("Spectating:"), 320.0f*_pixDPWidth/640.0f, 8.0f*_pixDPHeight/480.0f, C_WHITE|CT_OPAQUE);
    _pDP->PutTextC( strPlayerName, 320.0f*_pixDPWidth/640.0f, 24.0f*_pixDPHeight/480.0f, C_WHITE|CT_OPAQUE);
    if (GetSP()->sp_bIncrementCredit/*GetSP()->sp_gmGameMode==CSessionProperties::GM_SURVIVALCOOP*/) {
      CTString strScoreNextCredit;
      strScoreNextCredit.PrintF("%i", iScoreNextCredit);
      _pDP->PutTextC( TRANS("Score left to respawn:"), 320.0f*_pixDPWidth/640.0f, 48.0f*_pixDPHeight/480.0f, C_WHITE|CT_OPAQUE);
      _pDP->PutTextC( strScoreNextCredit, 320.0f*_pixDPWidth/640.0f, 64.0f*_pixDPHeight/480.0f, C_WHITE|CT_OPAQUE);
    }
  }

  // if not in single player mode, we'll have to calc (and maybe printout) other players' info
  //CPrintF("hud_iShowPlayerList=%i\n", hud_iShowPlayerList);
  if( !bSinglePlay && !_penPlayer->m_bShowingTabInfo && hud_iShowPlayerList>0)
  {
    // set font and prepare font parameters
    _pfdDisplayFont->SetVariableWidth();
    _pDP->SetFont( _pfdDisplayFont);
    _pDP->SetTextScaling( fTextScale);
    FLOAT fCharHeight = (_pfdDisplayFont->GetHeight()-2)*fTextScale;
    // generate and sort by mana list of active players
    BOOL bMaxScore=TRUE, bMaxMana=TRUE, bMaxFrags=TRUE, bMaxDeaths=TRUE;
    hud_iSortPlayers = Clamp( hud_iSortPlayers, -1L, 6L);
    SortKeys eKey = (SortKeys)hud_iSortPlayers;
    if (hud_iSortPlayers==-1) {
           if (bCooperative) eKey = PSK_HEALTH;
      else if (bScoreMatch)  eKey = PSK_SCORE;
      else if (bFragMatch)   eKey = PSK_FRAGS;
      else { ASSERT(FALSE);  eKey = PSK_NAME; }
    }
    if( bCooperative) eKey = (SortKeys)Clamp( (INDEX)eKey, 0L, 3L);
    if( eKey==PSK_HEALTH && (bScoreMatch || bFragMatch)) { eKey = PSK_NAME; }; // prevent health snooping in deathmatch
    INDEX iPlayers = SetAllPlayersStats(eKey);
    // loop thru players 
    for( INDEX i=0; i<iPlayers; i++)
    { // get player name and mana
      CPlayer *penPlayer = _apenPlayers[i];
      const CTString strName = penPlayer->GetPlayerName();
      const INDEX iScore  = penPlayer->m_psGameStats.ps_iScore;
      const INDEX iMana   = penPlayer->m_iMana;
      const INDEX iFrags  = penPlayer->m_psGameStats.ps_iKills;
      const INDEX iDeaths = penPlayer->m_psGameStats.ps_iDeaths;
      const INDEX iHealth = ClampDn( (INDEX)ceil( penPlayer->GetHealth()), 0L);
      const INDEX iArmor  = ClampDn( (INDEX)ceil( penPlayer->m_fArmor),    0L);
      const FLOAT fTotalAmmo = 0.0f;
      const INDEX iAmmoTypesTotal = 7;
      
      INDEX iAmmoIndex = 0;
      FLOAT fNormValue = 0;
      FLOAT fTotalValue = 0;
      
      CPlayerWeapons* pWeapons = penPlayer->GetPlayerWeapons();
      if(pWeapons == NULL) continue;
      FillWeaponAmmoTables(pWeapons);

      for( INDEX ii=iAmmoTypesTotal; ii>=0; ii--) {
	      INDEX iAmmoType = aiAmmoRemap[ii];
	      // if no ammo and hasn't got that weapon - just skip this ammo
	      AmmoInfo &ai = _aaiAmmo[iAmmoType];
	      ASSERT( ai.ai_iAmmoAmmount>=0);
	      if( !ai.ai_bHasWeapon) continue;
		      // display ammo info
		      fNormValue = (FLOAT)ai.ai_iAmmoAmmount / ai.ai_iMaxAmmoAmmount;
		      fTotalValue+=fNormValue;
	      iAmmoIndex++;
	    }
      fTotalValue=fTotalValue / iAmmoIndex+0.001;

      CTString strScore, strMana, strFrags, strDeaths, strHealth, strArmor, strAmmo;
      strScore.PrintF(  "%d", iScore);
      strMana.PrintF(   "%d", iMana);
      strFrags.PrintF(  "%d", iFrags);
      strDeaths.PrintF( "%d", iDeaths);
      strHealth.PrintF( "%d", iHealth);
      strArmor.PrintF(  "%d", iArmor);
      strAmmo.PrintF(   "%d", (INDEX)(fTotalValue*100));
      // detemine corresponding colors
      colHealth = C_mlRED;
      colMana = colScore = colFrags = colDeaths = colArmor = C_lGRAY;
      PrepareColorTransitions( colMax, colTop, colMid, C_lGRAY, 0.5f, 0.25f, FALSE);
      if( iMana   > _penPlayer->m_iMana)                      { bMaxMana   = FALSE; colMana   = C_WHITE; }
      if( iScore  > _penPlayer->m_psGameStats.ps_iScore)      { bMaxScore  = FALSE; colScore  = C_WHITE; }
      if( iFrags  > _penPlayer->m_psGameStats.ps_iKills)      { bMaxFrags  = FALSE; colFrags  = C_WHITE; }
      if( iDeaths > _penPlayer->m_psGameStats.ps_iDeaths)     { bMaxDeaths = FALSE; colDeaths = C_WHITE; }
      if( penPlayer==_penPlayer) colScore = colMana = colFrags = colDeaths = _colHUD; // current player
      if( iHealth>25) colHealth = _colHUD;
      if( iArmor >25) colArmor  = _colHUD;
      // * Classic player table *********************************************************************************
      // eventually print it out
      if( hud_iShowPlayers==1 || hud_iShowPlayers==-1 /*&& !bSinglePlay*/) {
        FLOAT fRow = 192.0f*_pixDPHeight/1080.0f;
        FLOAT fES = 0; //ExtraSpace for Ammo
        if (hud_iShowPlayerList==2) {fES = 4;} else {fES = 0;}
        // printout location and info aren't the same for deathmatch and coop play
        const FLOAT fCharWidth = (PIX)((_pfdDisplayFont->GetWidth()-2) *fTextScale);
        if( bCooperative) {
          _pDP->PutTextR( strName+":", _pixDPWidth-(8+fES)*fCharWidth, fCharHeight*i+fRow/*fOneUnit*2*/, colScore |_ulAlphaHUD);
          _pDP->PutTextC(  "/",        _pixDPWidth-(4+fES)*fCharWidth, fCharHeight*i+fRow/*fOneUnit*2*/, _colHUD  |_ulAlphaHUD);
          _pDP->PutTextC( strHealth,   _pixDPWidth-(6+fES)*fCharWidth, fCharHeight*i+fRow/*fOneUnit*2*/, colHealth|_ulAlphaHUD);
          _pDP->PutTextC( strArmor,    _pixDPWidth-(2+fES)*fCharWidth, fCharHeight*i+fRow/*fOneUnit*2*/, colArmor |_ulAlphaHUD);
          if (!GetSP()->sp_bInfiniteAmmo && hud_iShowPlayerList==2) {
            _pDP->PutTextC(  "/",        _pixDPWidth- 4*fCharWidth, fCharHeight*i+fRow/*fOneUnit*4*/, _colHUD  |_ulAlphaHUD);
            _pDP->PutTextC( strAmmo+"%", _pixDPWidth- 2*fCharWidth, fCharHeight*i+fRow/*fOneUnit*4*/, GetCurrentColor(fTotalValue)|_ulAlphaHUD);
          }
        } else if( bScoreMatch) { 
          _pDP->PutTextR( strName+":", _pixDPWidth-12*fCharWidth, fCharHeight*i+fRow/*fOneUnit*2*/, _colHUD |_ulAlphaHUD);
          _pDP->PutTextC(  "/",        _pixDPWidth- 5*fCharWidth, fCharHeight*i+fRow/*fOneUnit*2*/, _colHUD |_ulAlphaHUD);
          _pDP->PutTextC( strScore,    _pixDPWidth- 8*fCharWidth, fCharHeight*i+fRow/*fOneUnit*2*/, colScore|_ulAlphaHUD);
          _pDP->PutTextC( strMana,     _pixDPWidth- 2*fCharWidth, fCharHeight*i+fRow/*fOneUnit*2*/, colMana |_ulAlphaHUD);
        } else { // fragmatch!
          _pDP->PutTextR( strName+":", _pixDPWidth-8*fCharWidth, fCharHeight*i+fRow/*fOneUnit*2*/, _colHUD  |_ulAlphaHUD);
          _pDP->PutTextC(  "/",        _pixDPWidth-4*fCharWidth, fCharHeight*i+fRow/*fOneUnit*2*/, _colHUD  |_ulAlphaHUD);
          _pDP->PutTextC( strFrags,    _pixDPWidth-6*fCharWidth, fCharHeight*i+fRow/*fOneUnit*2*/, colFrags |_ulAlphaHUD);
          _pDP->PutTextC( strDeaths,   _pixDPWidth-2*fCharWidth, fCharHeight*i+fRow/*fOneUnit*2*/, colDeaths|_ulAlphaHUD);
        }
      }
      // calculate summ of scores (for coop mode)
      iScoreSum += iScore;  
    }
    // draw remaining time if time based death- or scorematch
    if ((bScoreMatch || bFragMatch) && hud_bShowMatchInfo && !_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1){
      CTString strLimitsInfo="";  
      if (GetSP()->sp_iTimeLimit>0) {
        FLOAT fTimeLeft = ClampDn(GetSP()->sp_iTimeLimit*60.0f - _pNetwork->GetGameTime(), 0.0f);
        strLimitsInfo.PrintF("%s^cFFFFFF%s: %s\n", strLimitsInfo, TRANS("TIME LEFT"), TimeToString(fTimeLeft));
      }
      extern INDEX SetAllPlayersStats( INDEX iSortKey);
      // fill players table
      const INDEX ctPlayers = SetAllPlayersStats(bFragMatch?5:3); // sort by frags or by score
      // find maximum frags/score that one player has
      INDEX iMaxFrags = LowerLimit(INDEX(0));
      INDEX iMaxScore = LowerLimit(INDEX(0));
      {for(INDEX iPlayer=0; iPlayer<ctPlayers; iPlayer++) {
        CPlayer *penPlayer = _apenPlayers[iPlayer];
        iMaxFrags = Max(iMaxFrags, penPlayer->m_psLevelStats.ps_iKills);
        iMaxScore = Max(iMaxScore, penPlayer->m_psLevelStats.ps_iScore);
      }}
      if (GetSP()->sp_iFragLimit>0) {
        INDEX iFragsLeft = ClampDn(GetSP()->sp_iFragLimit-iMaxFrags, INDEX(0));
        strLimitsInfo.PrintF("%s^cFFFFFF%s: %d\n", strLimitsInfo, TRANS("FRAGS LEFT"), iFragsLeft);
      }
      if (GetSP()->sp_iScoreLimit>0) {
        INDEX iScoreLeft = ClampDn(GetSP()->sp_iScoreLimit-iMaxScore, INDEX(0));
        strLimitsInfo.PrintF("%s^cFFFFFF%s: %d\n", strLimitsInfo, TRANS("SCORE LEFT"), iScoreLeft);
      }
      _pfdDisplayFont->SetFixedWidth();
      _pDP->SetFont( _pfdDisplayFont);
      _pDP->SetTextScaling( fTextScale*0.8f );
      _pDP->SetTextCharSpacing( -2.0f*fTextScale);
      _pDP->PutText( strLimitsInfo, 5.0f*_pixDPWidth/640.0f, 96.0f/*48.0f*/*_pixDPWidth/640.0f, C_WHITE|CT_OPAQUE);
    }
        

    // prepare color for local player printouts
    bMaxScore  ? colScore  = C_WHITE : colScore  = C_lGRAY;
    bMaxMana   ? colMana   = C_WHITE : colMana   = C_lGRAY;
    bMaxFrags  ? colFrags  = C_WHITE : colFrags  = C_lGRAY;
    bMaxDeaths ? colDeaths = C_WHITE : colDeaths = C_lGRAY;
  }
  //* End classic player table ******************************************************************************

  // printout player latency if needed
  if( hud_bShowLatency) {
    CTString strLatency;
    strLatency.PrintF( "%4.0fms", _penPlayer->m_tmLatency*1000.0f);
    PIX pixFontHeight = (PIX)(_pfdDisplayFont->GetHeight() *fTextScale +fTextScale+1);
    _pfdDisplayFont->SetFixedWidth();
    _pDP->SetFont( _pfdDisplayFont);
    _pDP->SetTextScaling( fTextScale);
    _pDP->SetTextCharSpacing( -2.0f*fTextScale);
    _pDP->PutTextR( strLatency, _pixDPWidth, _pixDPHeight-pixFontHeight, C_WHITE|CT_OPAQUE);
  }
  // restore font defaults
  _pfdDisplayFont->SetVariableWidth();
  _pDP->SetFont( &_fdNumbersFont);
  _pDP->SetTextCharSpacing(1);

  // prepare output strings and formats depending on game type
  FLOAT fWidthAdj = 8;
  INDEX iScore = _penPlayer->m_psGameStats.ps_iScore;
  INDEX iMana  = _penPlayer->m_iMana;
  if( bFragMatch) {
    if (!hud_bShowMatchInfo) { fWidthAdj = 4; }
    iScore = _penPlayer->m_psGameStats.ps_iKills;
    iMana  = _penPlayer->m_psGameStats.ps_iDeaths;
  } else if( bCooperative) {
    // in case of coop play, show squad (common) score
    //iScore = iScoreSum;
  }

  // prepare and draw score or frags info 
  strValue.PrintF( "%d", iScore);
  fRow = pixTopBound  +fHalfUnit;
  fCol = pixLeftBound +fHalfUnit;
  fAdv = fAdvUnit+ fChrUnit*fWidthAdj/2 -fHalfUnit;
  if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
    HUD_DrawBorder( fCol,      fRow, fOneUnit,           fOneUnit, colBorder);
    HUD_DrawBorder( fCol+fAdv, fRow, fChrUnit*fWidthAdj, fOneUnit, colBorder);
    HUD_DrawText(   fCol+fAdv, fRow, strValue, colScore, 1.0f);
    HUD_DrawIcon(   fCol,      fRow, _toFrags, C_WHITE, 1.0f, FALSE);
  }

  // eventually draw mana info 
  if( bScoreMatch || bFragMatch) {
    strValue.PrintF( "%d", iMana);
    fRow = pixTopBound  + fNextUnit+fHalfUnit;
    fCol = pixLeftBound + fHalfUnit;
    fAdv = fAdvUnit+ fChrUnit*fWidthAdj/2 -fHalfUnit;
    if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
      HUD_DrawBorder( fCol,      fRow, fOneUnit,           fOneUnit, colBorder);
      HUD_DrawBorder( fCol+fAdv, fRow, fChrUnit*fWidthAdj, fOneUnit, colBorder);
      HUD_DrawText(   fCol+fAdv, fRow, strValue,  colMana, 1.0f);
      HUD_DrawIcon(   fCol,      fRow, _toDeaths, C_WHITE /*colMana*/, 1.0f, FALSE);
    }
  }

  // if single player or cooperative mode
  if( bSinglePlay || bCooperative)
  {
    // prepare and draw hiscore info 
    strValue.PrintF( "%d", Max(_penPlayer->m_iHighScore, _penPlayer->m_psGameStats.ps_iScore));
    BOOL bBeating = _penPlayer->m_psGameStats.ps_iScore>_penPlayer->m_iHighScore;
    fRow = pixTopBound+fHalfUnit;
    fCol = 320.0f-fOneUnit-fChrUnit*8/2;
    fAdv = fAdvUnit+ fChrUnit*8/2 -fHalfUnit;
    //if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
    //  HUD_DrawBorder( fCol,      fRow, fOneUnit,   fOneUnit, colBorder);
    //  HUD_DrawBorder( fCol+fAdv, fRow, fChrUnit*8, fOneUnit, colBorder);
    //  HUD_DrawText(   fCol+fAdv, fRow, strValue, NONE, bBeating ? 0.0f : 1.0f);
    //  HUD_DrawIcon(   fCol,      fRow, _toHiScore, C_WHITE /*_colHUD*/, 1.0f, FALSE);
    //}

    // prepare and draw unread messages
    if( hud_bShowMessages && _penPlayer->m_ctUnreadMessages>0) {
      strValue.PrintF( "%d", _penPlayer->m_ctUnreadMessages);
      fRow = pixTopBound+fHalfUnit;
      fCol = pixRightBound-fHalfUnit-fAdvUnit-fChrUnit*4;
      const FLOAT tmIn = 0.5f;
      const FLOAT tmOut = 0.5f;
      const FLOAT tmStay = 2.0f;
      FLOAT tmDelta = _pTimer->GetLerpedCurrentTick()-_penPlayer->m_tmAnimateInbox;
      COLOR col = _colHUD;
      if (tmDelta>0 && tmDelta<(tmIn+tmStay+tmOut) && bSinglePlay) {
        FLOAT fRatio = 0.0f;
        if (tmDelta<tmIn) {
          fRatio = tmDelta/tmIn;
        } else if (tmDelta>tmIn+tmStay) {
          fRatio = (tmIn+tmStay+tmOut-tmDelta)/tmOut;
        } else {
          fRatio = 1.0f;
        }
        fRow+=fAdvUnit*5*fRatio;
        fCol-=fAdvUnit*15*fRatio;
        col = LerpColor(_colHUD, C_WHITE|0xFF, fRatio);
      }
      fAdv = fAdvUnit+ fChrUnit*4/2 -fHalfUnit;
     if (!_penPlayer->m_bShowingTabInfo && hud_iOldHUD==1) {
        HUD_DrawBorder( fCol,      fRow, fOneUnit,   fOneUnit, col);
        HUD_DrawBorder( fCol+fAdv, fRow, fChrUnit*4, fOneUnit, col);
        HUD_DrawText(   fCol+fAdv, fRow, strValue,   col, 1.0f);
        HUD_DrawIcon(   fCol,      fRow, _toMessage, C_WHITE /*col*/, 0.0f, TRUE);
     }
    }
  }

  // Alternate HUD
  if (hud_iOldHUD==2 && !_penPlayer->m_bShowingTabInfo) {
    _pDP->SetFont( _pfdDisplayFont);
    //_pDP->SetFont( _pfdConsoleFont);
    _pDP->SetTextScaling( fTextScale);

    CGameStat &gs = (CGameStat&)*_penPlayer->m_penGameStat;

    INDEX iShells            = _penWeapons->m_iShells;
    INDEX iMaxShells         = _penWeapons->m_iMaxShells;
    INDEX iBullets           = _penWeapons->m_iBullets;
    INDEX iMaxBullets        = _penWeapons->m_iMaxBullets;
    INDEX iRockets           = _penWeapons->m_iRockets;
    INDEX iMaxRockets        = _penWeapons->m_iMaxRockets;
    INDEX iGrenades          = _penWeapons->m_iGrenades;
    INDEX iMaxGrenades       = _penWeapons->m_iMaxGrenades;
    INDEX iNapalm            = _penWeapons->m_iNapalm;
    INDEX iMaxNapalm         = _penWeapons->m_iMaxNapalm;
    INDEX iSniperBullets     = _penWeapons->m_iSniperBullets;
    INDEX iMaxSniperBullets  = _penWeapons->m_iMaxSniperBullets;
    INDEX iElectricity       = _penWeapons->m_iElectricity;
    INDEX iMaxElectricity    = _penWeapons->m_iMaxElectricity;
    INDEX iIronBalls         = _penWeapons->m_iIronBalls;
    INDEX iMaxIronBalls      = _penWeapons->m_iMaxIronBalls;
    INDEX iSeriousBomb       = penPlayerCurrent->m_iSeriousBombCount;

    INDEX iHealth            = ClampDn( (INDEX)ceil( _penPlayer->GetHealth()), 0L);
    INDEX iArmor             = ClampDn( (INDEX)ceil( _penPlayer->m_fArmor), 0L);
    INDEX iShield            = _penPlayer->m_fShield;
    INDEX iMaxShield         = MaxShieldForPlayer(_penPlayer);
    INDEX iAmmo              = _penWeapons->GetAmmo();

    INDEX iPUInvisibility    = ceil(_penPlayer->m_tmInvisibility    - _pTimer->CurrentTick());
    INDEX iPUInvulnerability = ceil(_penPlayer->m_tmInvulnerability - _pTimer->CurrentTick());
    INDEX iPUSeriousDamage   = ceil(_penPlayer->m_tmSeriousDamage   - _pTimer->CurrentTick());
    INDEX iPUSeriousSpeed    = ceil(_penPlayer->m_tmSeriousSpeed    - _pTimer->CurrentTick());

    INDEX iScore      = _penPlayer->m_psGameStats.ps_iScore;
    INDEX iMana       = _penPlayer->m_iMana;
    INDEX iMessages   = _penPlayer->m_ctUnreadMessages;
    INDEX iCredits    = GetSP()->sp_ctCreditsLeft;
    INDEX iMaxCredits = GetSP()->sp_ctCredits;

    INDEX iEnemyKills = gs.m_iEnemyCount;
    INDEX iEnemyTotal = _penPlayer->m_psLevelTotal.ps_iKills;
    INDEX iSecrets    = gs.m_iSecretCount;
    INDEX iSecretsTotal = _penPlayer->m_psLevelTotal.ps_iSecrets;
    const INDEX iDeaths = _penPlayer->m_psGameStats.ps_iDeaths;

    if( bFragMatch) {
      iScore = _penPlayer->m_psGameStats.ps_iKills;
      iMana  = _penPlayer->m_psGameStats.ps_iDeaths;
    }

    INDEX iNextString = 0;
    INDEX iFontSize   = 2;

    if(!hud_bShowLatency) iNextString = 40;

    CTString strShells,        strMaxShells,
             strBullets,       strMaxBullets,
             strRockets,       strMaxRockets,
             strGrenades,      strMaxGrenades,
             strNapalm,        strMaxNapalm,
             strSniperBullets, strMaxSniperBullets,
             strElectricity,   strMaxElectricity,
             strIronBalls,     strMaxIronBalls,
             strSeriousBomb,
             strHealth, strArmor, strShield, strAmmo, strScore, strMana, strMessages, strCredits, strMaxCredits,
             strSecrets, strSecretsTotal, strKills, strEnemies, strDeaths, strSessionTime,
             strInvisibility, strInvulnerability, strSeriousDamage, strSeriousSpeed;

    COLOR    colShield, colAmmo, colShells, colBullets, colRockets, colGrenades, colNapalm, colSniperBullets, colElectricity, colIronBalls, colSeriousBomb;

    strShells.PrintF          ("%d",    iShells);        strMaxShells.PrintF       (" / %d", iMaxShells);
    strBullets.PrintF         ("%d",    iBullets);       strMaxBullets.PrintF      (" / %d", iMaxBullets);
    strRockets.PrintF         ("%d",    iRockets);       strMaxRockets.PrintF      (" / %d", iMaxRockets);
    strGrenades.PrintF        ("%d",    iGrenades);      strMaxGrenades.PrintF     (" / %d", iMaxGrenades);
    strNapalm.PrintF          ("%d",    iNapalm);        strMaxNapalm.PrintF       (" / %d", iMaxNapalm);
    strSniperBullets.PrintF   ("%d",    iSniperBullets); strMaxSniperBullets.PrintF(" / %d", iMaxSniperBullets);
    strElectricity.PrintF     ("%d",    iElectricity);   strMaxElectricity.PrintF  (" / %d", iMaxElectricity);
    strIronBalls.PrintF       ("%d",    iIronBalls);     strMaxIronBalls.PrintF    (" / %d", iMaxIronBalls);
    strSeriousBomb.PrintF     ("%d",    iSeriousBomb);

    strHealth.PrintF          ("%d",    iHealth);
    strArmor.PrintF           ("%d",    iArmor);
    strShield.PrintF          ("%d/%d", iShield, iMaxShield);
    strAmmo.PrintF            ("%d",    iAmmo);
    strCredits.PrintF         ("%d",    iCredits);
    strMaxCredits.PrintF      ("%d",    iMaxCredits);

    strScore.PrintF           ("%d",    iScore);
    strMana.PrintF            ("%d",    iMana);
    strMessages.PrintF        ("%d",    iMessages);
    strCredits.PrintF         ("%d",    iCredits);
    strMaxCredits.PrintF      (" / %d", iMaxCredits);

    strInvisibility.PrintF    ("%d",    iPUInvisibility);
    strInvulnerability.PrintF ("%d",    iPUInvulnerability);
    strSeriousDamage.PrintF   ("%d",    iPUSeriousDamage);
    strSeriousSpeed.PrintF    ("%d",    iPUSeriousSpeed);

    if (iEnemyKills >= iEnemyTotal) {
      strKills.PrintF           ("^c6cff6c%d / %d",    iEnemyKills, iEnemyTotal);
    } else {
      strKills.PrintF           ("%d / %d",    iEnemyKills, iEnemyTotal);
    }
    if (iSecrets >= iSecretsTotal) {
      strSecrets.PrintF         ("^c6cff6c%d / %d",    iSecrets, iSecretsTotal);
    } else {
      strSecrets.PrintF         ("%d / %d",    iSecrets, iSecretsTotal);
    }
    
    strDeaths.PrintF          ("%d",    iDeaths);
    strSessionTime.PrintF     ("%s",    TimeToString(_pNetwork->GetGameTime()));

    colHealth = colShield = C_mlRED;
    colArmor  = C_lGRAY;
    colAmmo   = C_mlRED;
    colShells = colBullets = colRockets = colGrenades = colNapalm = colSniperBullets = colElectricity = colIronBalls = colSeriousBomb = C_WHITE;
    if (iShells        == iMaxShells       ) {colShells        = C_lGREEN;} if (iShells        <= 10) {colShells        = C_mlRED;} if (iShells        == 0) {colShells        = C_GRAY;}
    if (iBullets       == iMaxBullets      ) {colBullets       = C_lGREEN;} if (iBullets       <= 50) {colBullets       = C_mlRED;} if (iBullets       == 0) {colBullets       = C_GRAY;}
    if (iRockets       == iMaxRockets      ) {colRockets       = C_lGREEN;} if (iRockets       <=  5) {colRockets       = C_mlRED;} if (iRockets       == 0) {colRockets       = C_GRAY;}
    if (iGrenades      == iMaxGrenades     ) {colGrenades      = C_lGREEN;} if (iGrenades      <=  5) {colGrenades      = C_mlRED;} if (iGrenades      == 0) {colGrenades      = C_GRAY;}
    if (iNapalm        == iMaxNapalm       ) {colNapalm        = C_lGREEN;} if (iNapalm        <= 50) {colNapalm        = C_mlRED;} if (iNapalm        == 0) {colNapalm        = C_GRAY;}
    if (iSniperBullets == iMaxSniperBullets) {colSniperBullets = C_lGREEN;} if (iSniperBullets <= 10) {colSniperBullets = C_mlRED;} if (iSniperBullets == 0) {colSniperBullets = C_GRAY;}
    if (iElectricity   == iMaxElectricity  ) {colElectricity   = C_lGREEN;} if (iElectricity   <= 50) {colElectricity   = C_mlRED;} if (iElectricity   == 0) {colElectricity   = C_GRAY;}
    if (iIronBalls     == iMaxIronBalls    ) {colIronBalls     = C_lGREEN;} if (iIronBalls     <=  4) {colIronBalls     = C_mlRED;} if (iIronBalls     == 0) {colIronBalls     = C_GRAY;}
    if (iSeriousBomb   == 3                ) {colSeriousBomb   = C_lGREEN;} if (iSeriousBomb   ==  1) {colSeriousBomb   = C_mlRED;} if (iSeriousBomb   == 0) {colSeriousBomb   = C_GRAY;}

    if( iHealth>100) {colHealth = _colHUD;} else if (iHealth>25) {colHealth = C_WHITE;}
    if( iArmor >100) {colArmor  = _colHUD;} else if (iArmor >25) {colArmor  = C_WHITE;}
    if( iShield==iMaxShield) {colShield = _colHUD;} else if (iShield>0) {colShield = C_WHITE;}
    if( iAmmo>    9) colAmmo   = C_WHITE;

    // draw backpack
    if (_penWeapons->m_fAmmoPackExtra >= 0.5f && _penWeapons->m_fAmmoPackExtra < 0.55f){
      DIO_DrawIcon(ESP_End, -62, ESP_End, -338+iNextString, _toCustomBP,  0, C_WHITE);
    } else if (_penWeapons->m_fAmmoPackExtra >= 0.55f){
      DIO_DrawIcon(ESP_End, -62, ESP_End, -338+iNextString, _toSeriousBP, 0, C_WHITE);
    }
    // draw ammo
    if (!GetSP()->sp_bInfiniteAmmo) {
      DIO_DrawIcon(ESP_End,  -140, ESP_End, -300+iNextString,  _toAShells,          0, C_WHITE);
      DIO_DrawText(ESP_End,   -80, ESP_End, -279+iNextString,  strShells,           iFontSize, ESP_End,    colShells |_ulAlphaHUD);
      DIO_DrawText(ESP_End,   -80, ESP_End, -279+iNextString,  strMaxShells,        iFontSize, ESP_Start,  C_WHITE |_ulAlphaHUD);

      DIO_DrawIcon(ESP_End,  -140, ESP_End, -270+iNextString,  _toABullets,         0, C_WHITE);
      DIO_DrawText(ESP_End,   -80, ESP_End, -249+iNextString,  strBullets,          iFontSize, ESP_End,    colBullets |_ulAlphaHUD);
      DIO_DrawText(ESP_End,   -80, ESP_End, -249+iNextString,  strMaxBullets,       iFontSize, ESP_Start,  C_WHITE |_ulAlphaHUD);

      DIO_DrawIcon(ESP_End,  -140, ESP_End, -240+iNextString,  _toARockets,         0, C_WHITE);
      DIO_DrawText(ESP_End,   -80, ESP_End, -219+iNextString,  strRockets,          iFontSize, ESP_End,    colRockets |_ulAlphaHUD);
      DIO_DrawText(ESP_End,   -80, ESP_End, -219+iNextString,  strMaxRockets,       iFontSize, ESP_Start,  C_WHITE |_ulAlphaHUD);

      DIO_DrawIcon(ESP_End,  -140, ESP_End, -210+iNextString,  _toAGrenades,        0, C_WHITE);
      DIO_DrawText(ESP_End,   -80, ESP_End, -189+iNextString,  strGrenades,         iFontSize, ESP_End,    colGrenades |_ulAlphaHUD);
      DIO_DrawText(ESP_End,   -80, ESP_End, -189+iNextString,  strMaxGrenades,      iFontSize, ESP_Start,  C_WHITE |_ulAlphaHUD);

      DIO_DrawIcon(ESP_End,  -140, ESP_End, -180+iNextString,  _toANapalm,          0, C_WHITE);
      DIO_DrawText(ESP_End,   -80, ESP_End, -159+iNextString,  strNapalm,           iFontSize, ESP_End,    colNapalm |_ulAlphaHUD);
      DIO_DrawText(ESP_End,   -80, ESP_End, -159+iNextString,  strMaxNapalm,        iFontSize, ESP_Start,  C_WHITE |_ulAlphaHUD);

      DIO_DrawIcon(ESP_End,  -140, ESP_End, -150+iNextString,  _toASniperBullets,   0, C_WHITE);
      DIO_DrawText(ESP_End,   -80, ESP_End, -129+iNextString,  strSniperBullets,    iFontSize, ESP_End,    colSniperBullets |_ulAlphaHUD);
      DIO_DrawText(ESP_End,   -80, ESP_End, -129+iNextString,  strMaxSniperBullets, iFontSize, ESP_Start,  C_WHITE |_ulAlphaHUD);

      DIO_DrawIcon(ESP_End,  -140, ESP_End, -120+iNextString,  _toAElectricity,     0, C_WHITE);
      DIO_DrawText(ESP_End,   -80, ESP_End,  -99+iNextString,  strElectricity,      iFontSize, ESP_End,    colElectricity |_ulAlphaHUD);
      DIO_DrawText(ESP_End,   -80, ESP_End,  -99+iNextString,  strMaxElectricity,   iFontSize, ESP_Start,  C_WHITE |_ulAlphaHUD);

      DIO_DrawIcon(ESP_End,  -140, ESP_End,  -90+iNextString,  _toAIronBall,        0, C_WHITE);
      DIO_DrawText(ESP_End,   -80, ESP_End,  -69+iNextString,  strIronBalls,        iFontSize, ESP_End,    colIronBalls |_ulAlphaHUD);
      DIO_DrawText(ESP_End,   -80, ESP_End,  -69+iNextString,  strMaxIronBalls,     iFontSize, ESP_Start,  C_WHITE |_ulAlphaHUD);
    }
    DIO_DrawIcon(ESP_End,  -140, ESP_End,  -60+iNextString,  _toASeriousBomb,     0, C_WHITE);
    DIO_DrawText(ESP_End,   -80, ESP_End,  -39+iNextString,  strSeriousBomb,      iFontSize, ESP_End,    colSeriousBomb |_ulAlphaHUD);
    DIO_DrawText(ESP_End,   -80, ESP_End,  -39+iNextString,  " / 3",              iFontSize, ESP_Start,  C_WHITE |_ulAlphaHUD);
    
    // draw health, armor, shields
    DIO_DrawIcon(ESP_Start,  20, ESP_End, -20,   _toHealth,         0, C_WHITE);
    DIO_DrawText(ESP_Start,  80, ESP_End,   0,   strHealth,         iFontSize, ESP_Middle,    colHealth |_ulAlphaHUD);

    if (_penPlayer->m_fArmor>0) {
      if (_penPlayer->m_fArmor<=50.5) {
        DIO_DrawIcon(ESP_Start, 155, ESP_End, -20,   _toArmorSmall,   0, C_WHITE);
      } else if (_penPlayer->m_fArmor<=100.5) {
        DIO_DrawIcon(ESP_Start, 155, ESP_End, -20,   _toArmorMedium,  0, C_WHITE);
      } else {
        DIO_DrawIcon(ESP_Start, 155, ESP_End, -20,   _toArmorLarge,   0, C_WHITE);
      }
      DIO_DrawText(ESP_Start, 215, ESP_End,   0,   strArmor,        iFontSize, ESP_Middle,    colArmor  |_ulAlphaHUD);
    }

    if (iMaxShield>0) {
      DIO_DrawIcon(ESP_Start, 290, ESP_End, -20,   _atoPowerups[1], 0, C_WHITE);
      DIO_DrawText(ESP_Start, 350, ESP_End, 0,   strShield,       iFontSize, ESP_Middle,    colShield |_ulAlphaHUD);
    }

    // draw powerup(s)
    if (iPUInvisibility>0) {
      DIO_DrawIcon(ESP_Start,  20, ESP_End, -65,    _atoPowerups[0],     0, C_WHITE);
      DIO_DrawText(ESP_Start,  80, ESP_End, -45,    strInvisibility,     iFontSize, ESP_Middle, C_WHITE |_ulAlphaHUD);
    }
    if (iPUInvulnerability>0) {
      DIO_DrawIcon(ESP_Start,  20, ESP_End, -95,    _atoPowerups[1],    0, C_WHITE);
      DIO_DrawText(ESP_Start,  80, ESP_End, -75,    strInvulnerability, iFontSize, ESP_Middle, C_WHITE |_ulAlphaHUD);
    }
    if (iPUSeriousDamage>0) {
      DIO_DrawIcon(ESP_Start,  20, ESP_End, -125,   _atoPowerups[2],    0, C_WHITE);
      DIO_DrawText(ESP_Start,  80, ESP_End, -105,   strSeriousDamage,   iFontSize, ESP_Middle, C_WHITE |_ulAlphaHUD);
    }
    if (iPUSeriousSpeed>0) {
      DIO_DrawIcon(ESP_Start,  20, ESP_End, -155,   _atoPowerups[3],    0, C_WHITE);
      DIO_DrawText(ESP_Start,  80, ESP_End, -135,   strSeriousSpeed,    iFontSize, ESP_Middle, C_WHITE |_ulAlphaHUD);
    }

    // draw level stats
    if (bSinglePlay || bCooperative) {
      DIO_DrawIcon(ESP_End, -20, ESP_Start,  50,   _toFrags,        0, C_WHITE);
      DIO_DrawText(ESP_End, -50, ESP_Start,  70,   strKills,        iFontSize, ESP_End,    C_WHITE |_ulAlphaHUD);

      DIO_DrawIcon(ESP_End, -20, ESP_Start,  80,   _toScore,        0, C_WHITE);
      DIO_DrawText(ESP_End, -50, ESP_Start, 100,   strSecrets,      iFontSize, ESP_End,    C_WHITE |_ulAlphaHUD);
    // draw deaths for coop
      if (bCooperative) {
        DIO_DrawIcon(ESP_End, -20, ESP_Start, 110,   _toDeaths,    0, C_WHITE);
        DIO_DrawText(ESP_End, -50, ESP_Start, 130,   strDeaths,  iFontSize, ESP_End, C_WHITE |_ulAlphaHUD);
      }
      DIO_DrawIcon(ESP_End, -20, ESP_Start, 140,   _atoPowerups[3], 0, C_WHITE);
      DIO_DrawText(ESP_End, -50, ESP_Start, 160,   strSessionTime,  iFontSize, ESP_End, C_WHITE |_ulAlphaHUD);
    }

    // draw fragmatch stats
    if( bFragMatch || bScoreMatch) {
      DIO_DrawIcon(ESP_Start, 20,  ESP_Start, 20,   _toFrags,   0, C_WHITE);
      DIO_DrawText(ESP_Start, 50, ESP_Start, 40,   strScore,   iFontSize, ESP_Start, C_WHITE|_ulAlphaHUD);
      DIO_DrawIcon(ESP_Start, 20,  ESP_Start, 50,   _toDeaths,  0, C_WHITE);
      DIO_DrawText(ESP_Start, 50, ESP_Start, 70,   strMana,   iFontSize, ESP_Start, C_WHITE|_ulAlphaHUD);
    }

    // draw score
    if (bSinglePlay || bCooperative) {
      DIO_DrawIcon(ESP_Start, 20,  ESP_Start, 20,   _toScore,   0, C_WHITE);
      DIO_DrawText(ESP_Start, 50, ESP_Start, 40,   strScore,   iFontSize, ESP_Start, C_WHITE|_ulAlphaHUD);
    }
    // draw messages
    if (hud_bShowMessages>0 &&  _penPlayer->m_ctUnreadMessages>0) {
      DIO_DrawIcon(ESP_End, -20, ESP_Start, 20,   _toMessage,    0, C_WHITE);
      DIO_DrawText(ESP_End, -50, ESP_Start, 40,   strMessages,   iFontSize, ESP_End, C_WHITE |_ulAlphaHUD);
    }
    // draw respawn credits
    if (GetSP()->sp_ctCredits != -1 && bCooperative) {
      DIO_DrawIcon(ESP_Start, 20, ESP_Start, 50,   _atoPowerups[0],  0, C_WHITE);
      DIO_DrawText(ESP_Start, 77, ESP_Start, 71,   strCredits,   iFontSize, ESP_End, C_WHITE|_ulAlphaHUD);
      if (!GetSP()->sp_bIncrementCredit) {
        DIO_DrawText(ESP_Start, 77, ESP_Start, 71, strMaxCredits, iFontSize, ESP_Start, C_WHITE|_ulAlphaHUD);
      }
    }
    // draw current ammo
    DIO_DrawIcon(ESP_Middle, -20,  ESP_End, -20,   *ptoCurrentWeapon, 0, C_WHITE);
    if (!GetSP()->sp_bInfiniteAmmo) {
      if (ptoCurrentAmmo==NULL) {
        DIO_DrawText(ESP_Middle, 0,  ESP_End, -25,   "",         4, ESP_Middle,    colAmmo   |_ulAlphaHUD);
      } else {
        DIO_DrawText(ESP_Middle,   0,  ESP_End, -25,   strAmmo,           4, ESP_Middle,    colAmmo   |_ulAlphaHUD);
        DIO_DrawIcon(ESP_Middle,  20,  ESP_End, -20,   *ptoCurrentAmmo,   0, C_WHITE);
      }
    }
  }

  #ifdef ENTITY_DEBUG
  // if entity debug is on, draw entity stack
  HUD_DrawEntityStack();
  #endif

  // draw cheat modes
  if( GetSP()->sp_ctMaxPlayers==1) {
    INDEX iLine=1;
    ULONG ulAlpha = sin(_tmNow*16)*96 +128;
    PIX pixFontHeight = _pfdConsoleFont->fd_pixCharHeight;
    const COLOR colCheat = _colHUDText;
    _pDP->SetFont( _pfdConsoleFont);
    _pDP->SetTextScaling( 1.0f);
    const FLOAT fchtTM = cht_fTranslationMultiplier; // for text formatting sake :)
    if( fchtTM > 1.0f)  { _pDP->PutTextR( "turbo",     _pixDPWidth-1, _pixDPHeight-pixFontHeight*iLine, colCheat|ulAlpha); iLine++; }
    if( cht_bInvisible) { _pDP->PutTextR( "invisible", _pixDPWidth-1, _pixDPHeight-pixFontHeight*iLine, colCheat|ulAlpha); iLine++; }
    if( cht_bGhost)     { _pDP->PutTextR( "ghost",     _pixDPWidth-1, _pixDPHeight-pixFontHeight*iLine, colCheat|ulAlpha); iLine++; }
    if( cht_bFly)       { _pDP->PutTextR( "fly",       _pixDPWidth-1, _pixDPHeight-pixFontHeight*iLine, colCheat|ulAlpha); iLine++; }
    if( cht_bGod)       { _pDP->PutTextR( "god",       _pixDPWidth-1, _pixDPHeight-pixFontHeight*iLine, colCheat|ulAlpha); iLine++; }
  }

  // in the end, remember the current time so it can be used in the next frame
  _tmLast = _tmNow;

}



// initialize all that's needed for drawing the HUD
extern void InitHUD(void)
{
  // try to
  try {
    // initialize and load HUD numbers font
    DECLARE_CTFILENAME( fnFont, "Fonts\\Numbers3.fnt");
    _fdNumbersFont.Load_t( fnFont);
    //_fdNumbersFont.SetCharSpacing(0);

    // initialize status bar textures
    _toHealth.SetData_t(  CTFILENAME("TexturesMP\\Interface\\HSuper.tex"));
    _toOxygen.SetData_t(  CTFILENAME("TexturesMP\\Interface\\Oxygen-2.tex"));
    _toFrags.SetData_t(   CTFILENAME("TexturesMP\\Interface\\IBead.tex"));
    _toDeaths.SetData_t(  CTFILENAME("TexturesMP\\Interface\\ISkull.tex"));
    _toScore.SetData_t(   CTFILENAME("TexturesMP\\Interface\\IScore.tex"));
    _toHiScore.SetData_t( CTFILENAME("TexturesMP\\Interface\\IHiScore.tex"));
    _toMessage.SetData_t( CTFILENAME("TexturesMP\\Interface\\IMessage.tex"));
    _toMana.SetData_t(    CTFILENAME("TexturesMP\\Interface\\IValue.tex"));
    _toArmorSmall.SetData_t(  CTFILENAME("TexturesMP\\Interface\\ArSmall.tex"));
    _toArmorMedium.SetData_t(   CTFILENAME("TexturesMP\\Interface\\ArMedium.tex"));
    _toArmorLarge.SetData_t(   CTFILENAME("TexturesMP\\Interface\\ArStrong.tex"));

    // initialize ammo textures                    
    _toAShells.SetData_t(        CTFILENAME("TexturesMP\\Interface\\AmShells.tex"));
    _toABullets.SetData_t(       CTFILENAME("TexturesMP\\Interface\\AmBullets.tex"));
    _toARockets.SetData_t(       CTFILENAME("TexturesMP\\Interface\\AmRockets.tex"));
    _toAGrenades.SetData_t(      CTFILENAME("TexturesMP\\Interface\\AmGrenades.tex"));
    _toANapalm.SetData_t(        CTFILENAME("TexturesMP\\Interface\\AmFuelReservoir.tex"));
    _toAElectricity.SetData_t(   CTFILENAME("TexturesMP\\Interface\\AmElectricity.tex"));
    _toAIronBall.SetData_t(      CTFILENAME("TexturesMP\\Interface\\AmCannonBall.tex"));
    _toASniperBullets.SetData_t( CTFILENAME("TexturesMP\\Interface\\AmSniperBullets.tex"));
    _toASeriousBomb.SetData_t(   CTFILENAME("TexturesMP\\Interface\\AmSeriousBomb.tex"));
    // initialize weapon textures
    _toWKnife.SetData_t(           CTFILENAME("TexturesMP\\Interface\\WKnife.tex"));
    _toWColt.SetData_t(            CTFILENAME("TexturesMP\\Interface\\WColt.tex"));
    _toWSingleShotgun.SetData_t(   CTFILENAME("TexturesMP\\Interface\\WSingleShotgun.tex"));
    _toWDoubleShotgun.SetData_t(   CTFILENAME("TexturesMP\\Interface\\WDoubleShotgun.tex"));
    _toWTommygun.SetData_t(        CTFILENAME("TexturesMP\\Interface\\WTommygun.tex"));
    _toWMinigun.SetData_t(         CTFILENAME("TexturesMP\\Interface\\WMinigun.tex"));
    _toWRocketLauncher.SetData_t(  CTFILENAME("TexturesMP\\Interface\\WRocketLauncher.tex"));
    _toWGrenadeLauncher.SetData_t( CTFILENAME("TexturesMP\\Interface\\WGrenadeLauncher.tex"));
    _toWLaser.SetData_t(           CTFILENAME("TexturesMP\\Interface\\WLaser.tex"));
    _toWIronCannon.SetData_t(      CTFILENAME("TexturesMP\\Interface\\WCannon.tex"));
    _toWChainsaw.SetData_t(        CTFILENAME("TexturesMP\\Interface\\WChainsaw.tex"));
    _toWSniper.SetData_t(          CTFILENAME("TexturesMP\\Interface\\WSniper.tex"));
    _toWFlamer.SetData_t(          CTFILENAME("TexturesMP\\Interface\\WFlamer.tex"));
        
    // initialize powerup textures (DO NOT CHANGE ORDER!)
    _atoPowerups[0].SetData_t( CTFILENAME("TexturesMP\\Interface\\PInvisibility.tex"));
    _atoPowerups[1].SetData_t( CTFILENAME("TexturesMP\\Interface\\PInvulnerability.tex"));
    _atoPowerups[2].SetData_t( CTFILENAME("TexturesMP\\Interface\\PSeriousDamage.tex"));
    _atoPowerups[3].SetData_t( CTFILENAME("TexturesMP\\Interface\\PSeriousSpeed.tex"));
    // initialize sniper mask texture
    _toSniperMask.SetData_t(       CTFILENAME("TexturesMP\\Interface\\SniperMask.tex"));
    _toSniperWheel.SetData_t(       CTFILENAME("TexturesMP\\Interface\\SniperWheel.tex"));
    _toSniperArrow.SetData_t(       CTFILENAME("TexturesMP\\Interface\\SniperArrow.tex"));
    _toSniperEye.SetData_t(       CTFILENAME("TexturesMP\\Interface\\SniperEye.tex"));
    _toSniperLed.SetData_t(       CTFILENAME("TexturesMP\\Interface\\SniperLed.tex"));

    // initialize tile texture
    _toTile.SetData_t( CTFILENAME("Textures\\Interface\\Tile.tex"));

    _toPointer.SetData_t(    CTFILENAME("Textures\\Interface\\Pointer.tex"));
    _toCustomBP.SetData_t(   CTFILENAME("Textures\\Interface\\CustomBP.tex"));
    _toSeriousBP.SetData_t(  CTFILENAME("Textures\\Interface\\SeriousBP.tex"));
    _toCustomBP32.SetData_t( CTFILENAME("Textures\\Interface\\CustomBP32.tex"));
    _toSeriousBP32.SetData_t(CTFILENAME("Textures\\Interface\\SeriousBP32.tex"));
    
    // set all textures as constant
    ((CTextureData*)_toHealth .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toOxygen .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toFrags  .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toDeaths .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toScore  .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toHiScore.GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toMessage.GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toMana   .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toArmorSmall.GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toArmorMedium.GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toArmorLarge.GetData())->Force(TEX_CONSTANT);

    ((CTextureData*)_toAShells       .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toABullets      .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toARockets      .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toAGrenades     .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toANapalm       .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toAElectricity  .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toAIronBall     .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toASniperBullets.GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toASeriousBomb  .GetData())->Force(TEX_CONSTANT);

    ((CTextureData*)_toWKnife          .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toWColt           .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toWSingleShotgun  .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toWDoubleShotgun  .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toWTommygun       .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toWRocketLauncher .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toWGrenadeLauncher.GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toWChainsaw       .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toWLaser          .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toWIronCannon     .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toWSniper         .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toWMinigun        .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toWFlamer         .GetData())->Force(TEX_CONSTANT);
    
    ((CTextureData*)_atoPowerups[0].GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_atoPowerups[1].GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_atoPowerups[2].GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_atoPowerups[3].GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toTile      .GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toSniperMask.GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toSniperWheel.GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toSniperArrow.GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toSniperEye.GetData())->Force(TEX_CONSTANT);
    ((CTextureData*)_toSniperLed.GetData())->Force(TEX_CONSTANT);

	  ((CTextureData*)_toPointer    .GetData())->Force(TEX_CONSTANT);        // HUD 3D
    ((CTextureData*)_toCustomBP   .GetData())->Force(TEX_CONSTANT);        //
    ((CTextureData*)_toSeriousBP  .GetData())->Force(TEX_CONSTANT);        //
    ((CTextureData*)_toCustomBP32 .GetData())->Force(TEX_CONSTANT);        //
    ((CTextureData*)_toSeriousBP32.GetData())->Force(TEX_CONSTANT);        //
  }
  catch( char *strError) {
    FatalError( strError);
  }

}


// clean up
extern void EndHUD(void)
{

}

