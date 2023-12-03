
#include "stdafx.h"
#include "LCDDrawing.h"
#include <locale.h>

#define USECUSTOMTEXT 0

extern CGame *_pGame;

#if USECUSTOMTEXT
  static CTString _strCustomText = "";
#endif
static CDrawPort *_pdpLoadingHook = NULL;  // drawport for loading hook
extern BOOL _bUserBreakEnabled;
extern CSessionProperties* _pspLocal;
extern CSessionProperties* _pspServer;

CSessionProperties* _pspLocal  = NULL;
CSessionProperties* _pspServer = NULL;


#define REFRESHTIME (0.2f)

void RemapLevelNames(INDEX &iLevel)
{
  switch( iLevel) {
  case 10:  iLevel =  1;  break;
  case 11:  iLevel =  2;  break;
  case 12:  iLevel =  3;  break;
  case 13:  iLevel =  4;  break;
  case 14:  iLevel =  5;  break;
  case 15:  iLevel =  6;  break;
  case 21:  iLevel =  7;  break;
  case 22:  iLevel =  8;  break;
  case 23:  iLevel =  9;  break;
  case 24:  iLevel = 10;  break;
  case 31:  iLevel = 11;  break;
  case 32:  iLevel = 12;  break;
  case 33:  iLevel = 13;  break;
  default:  iLevel = -1;	break;
  }
}

void DrawSessionDetails(CDrawPort *pdp, CSessionProperties *psp)
{
	if (!psp->sp_bSinglePlayer) {
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
	  pdp->PutTextCXY(TranslateConst(_pNetwork->ga_World.GetName(), 0), pixDPWidth*0.5f, pixDPHeight*0.05f, SE_COL_WHITE|CT_OPAQUE);// level name
	  pdp->PutText(TRANS("Game options"), iGameOptionPosX, pixDPHeight*0.1f, SE_COL_BLUE_NEUTRAL_LT|CT_OPAQUE);
	  INDEX iDisplayedOption=0;
	  
				CTString strGameDifficulty;
			    switch (psp->sp_gdGameDifficulty) {
					case -1: strGameDifficulty = TRANS("Tourist"); break;
					case  0: strGameDifficulty = TRANS("Easy")   ; break;
					case  1: strGameDifficulty = TRANS("Normal") ; break;
					case  2: strGameDifficulty = TRANS("Hard")   ; break;
					case  3: strGameDifficulty = TRANS("Serious"); break;
				}
				strGameDifficulty.PrintF(TRANS("Difficulty: %s"), strGameDifficulty);
			    pdp->PutText(strGameDifficulty , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
		  if (psp->sp_bCooperative) {

			  if (psp->sp_bUseExtraEnemies) {
				pdp->PutText(TRANS("Extra enemies") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (!psp->sp_bWeaponsStay) {
				pdp->PutText(TRANS("Weapons disappear after picking") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (!psp->sp_bAmmoStays) {
				pdp->PutText(TRANS("Ammo disappears after picking") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (!psp->sp_bHealthArmorStays) {
				pdp->PutText(TRANS("Health and armor disappears after picking") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (psp->sp_ctCredits!=-1) {
				CTString str;
				if (psp->sp_ctCredits==0) {
					pdp->PutText(TRANS("^cff9900Respawn credits: None"), iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
					} else {
					str.PrintF(TRANS("Respawn credits: %d"), psp->sp_ctCredits);
					pdp->PutText (str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
			  }
				iDisplayedOption++;
			  }
			  if (psp->sp_bFriendlyFire) {
				pdp->PutText(TRANS("^cff9900Friendly fire") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (psp->sp_fExtraEnemyStrength>0) {
				  INDEX i=psp->sp_fExtraEnemyStrength*100;
				  CTString str;
				  str.PrintF(TRANS("Extra enemy strength: %d%s"), i,"%");
				pdp->PutText (str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (psp->sp_fExtraEnemyStrengthPerPlayer>0) {
				  INDEX i=psp->sp_fExtraEnemyStrengthPerPlayer*100;
				  CTString str;
				  str.PrintF(TRANS("Enemy strength per player: %d%s"), i,"%");
				pdp->PutText (str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (!psp->sp_bPlayEntireGame) {
				pdp->PutText(TRANS("Play only at the current level") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (!psp->sp_bRespawnInPlace) {
				pdp->PutText(TRANS("Players reborn on control point") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }

		  }
		  if (psp->sp_gmGameMode == CSessionProperties::GM_FRAGMATCH||psp->sp_gmGameMode == CSessionProperties::GM_SCOREMATCH)
		  {
			  if (!psp->sp_bAllowHealth) {
				pdp->PutText(TRANS("No health") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (!psp->sp_bAllowArmor) {
				pdp->PutText(TRANS("No Armor") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (psp->sp_iTimeLimit>0) {
				  INDEX i=psp->sp_iTimeLimit;
				  CTString str;
				  str.PrintF(TRANS("Time limit: %d%s"), i," minutes");
				pdp->PutText(str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (psp->sp_iFragLimit>0) {
				CTString str;
				str.PrintF(TRANS("Frag limit: %d"), psp->sp_iFragLimit);
				pdp->PutText(str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }
			  if (psp->sp_iScoreLimit>0) {
				CTString str;
				str.PrintF(TRANS("Score limit: %d"), psp->sp_iScoreLimit);
				pdp->PutText(str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
				iDisplayedOption++;
			  }

		  }
		if (psp->sp_tmSpawnInvulnerability>0) {
			CTString str;
			str.PrintF(TRANS("Invulnerable after spawning (sec): %d"), (INDEX)psp->sp_tmSpawnInvulnerability);
			pdp->PutText(str, iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
			iDisplayedOption++;
		/*} else {
			pdp->PutText(TRANS("No respawn"), iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
			iDisplayedOption++;
		*/}
		if (psp->sp_bInfiniteAmmo) {
			pdp->PutText(TRANS("Infinite ammo") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
			iDisplayedOption++;
		}
    if (psp->sp_bGiveExtraShield) {
			pdp->PutText(TRANS("Extra Shield reward") , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
			iDisplayedOption++;
		}
    if (psp->sp_fStartMaxShield>0) {
      CTString str;
      str.PrintF(TRANS("Shields on start: %d"), (INDEX)psp->sp_fStartMaxShield);
			pdp->PutText(str , iGameOptionPosX, (pixDPHeight*0.175f)+(iHeightSpacing*iDisplayedOption*fScaleh), SE_COL_WHITE|CT_OPAQUE);
			iDisplayedOption++;
		}
	  }
}


static void LoadingHook_t(CProgressHookInfo *pphi)
{
	if (_pspLocal==NULL) {
		_pspLocal=(CSessionProperties *)_pNetwork->GetSessionProperties();
	} else if (_pspServer==NULL && _pspLocal!=(CSessionProperties *)_pNetwork->GetSessionProperties()){
		//_pspServer=(CSessionProperties *)_pNetwork->GetSessionProperties();
		//_pspServer=new CSessionProperties(*(_pNetwork->GetSessionProperties()));
		  _pspServer = new CSessionProperties(*((CSessionProperties*)_pNetwork->GetSessionProperties()));
	}
  // if user presses escape
  ULONG ulCheckFlags = 0x8000;
  if (pphi->phi_fCompleted>0) {
    ulCheckFlags |= 0x0001;
  }
  if (_bUserBreakEnabled && (GetAsyncKeyState(VK_ESCAPE)&ulCheckFlags)) {
    // break loading
    throw TRANS("User break!");
  }

#if USECUSTOMTEXT
  // if no custom loading text
  if (_strCustomText=="") {
    // load it
    try {
      _strCustomText.Load_t(CTFILENAME("Data\\LoadingText.txt"));
    } catch (char *strError) {
      _strCustomText = strError;
    }
  }
#endif

  // measure time since last call
  static CTimerValue tvLast(0I64);
  CTimerValue tvNow = _pTimer->GetHighPrecisionTimer();

  // if not first or final update, and not enough time passed
  if (pphi->phi_fCompleted!=0 && pphi->phi_fCompleted!=1 &&
     (tvNow-tvLast).GetSeconds() < REFRESHTIME) {
    // do nothing
    return;
  }
  tvLast = tvNow;

  // skip if cannot lock drawport
  CDrawPort *pdp = _pdpLoadingHook;                           
  ASSERT(pdp!=NULL);
  CDrawPort dpHook(pdp, TRUE);
  if( !dpHook.Lock()) return;

  // clear screen
  dpHook.Fill(C_BLACK|255);

  // get session properties currently loading
  CSessionProperties *psp = (CSessionProperties *)_pNetwork->GetSessionProperties();
  ULONG ulLevelMask = psp->sp_ulLevelsMask;
  INDEX iLevel = -1;
  if (psp->sp_bCooperative) {
    INDEX iLevel = -1;
    INDEX iLevelNext = -1;
    CTString strLevelName = _pNetwork->ga_fnmWorld.FileName();
    CTString strNextLevelName = _pNetwork->ga_fnmNextLevel.FileName();
    
    INDEX u, v;
    u = v = -1;
    strLevelName.ScanF("%01d_%01d_", &u, &v);
    iLevel = u*10+v;
    RemapLevelNames(iLevel);
    u = v = -1;
    strNextLevelName.ScanF("%01d_%01d_", &u, &v);
    iLevelNext = u*10+v;
    RemapLevelNames(iLevelNext);
    
    //strLevelName.ScanF("%02d_", &iLevel);
    //strNextLevelName.ScanF("%02d_", &iLevelNext);
   
    if (iLevel>0) {
      ulLevelMask|=1<<(iLevel-1);
    }
    if (iLevelNext>0) {
      ulLevelMask|=1<<(iLevelNext-1);
    }
  }

  if (ulLevelMask!=0 && !_pNetwork->IsPlayingDemo()) {
    // map hook
    extern void RenderMap( CDrawPort *pdp, ULONG ulLevelMask, CProgressHookInfo *pphi);
    RenderMap(&dpHook, ulLevelMask, pphi);

    // finish rendering
    dpHook.Unlock();
    dpHook.dp_Raster->ra_pvpViewPort->SwapBuffers();

    // keep current time
    tvLast = _pTimer->GetHighPrecisionTimer();
    return;
  }

  // get sizes
  PIX pixSizeI = dpHook.GetWidth();
  PIX pixSizeJ = dpHook.GetHeight();
  CFontData *pfd = _pfdConsoleFont;
  PIX pixCharSizeI = pfd->fd_pixCharWidth  + pfd->fd_pixCharSpacing;
  PIX pixCharSizeJ = pfd->fd_pixCharHeight + pfd->fd_pixLineSpacing;

  PIX pixBarSizeJ = 17;//*pixSizeJ/480;

  COLOR colBcg = LerpColor(C_BLACK, SE_COL_BLUE_LIGHT, 0.30f)|0xff;
  COLOR colBar = LerpColor(C_BLACK, SE_COL_BLUE_LIGHT, 0.45f)|0xff;
  COLOR colLines = colBar; //C_vdGREEN|0xff;
  COLOR colText = LerpColor(C_BLACK, SE_COL_BLUE_LIGHT, 0.95f)|0xff;
  COLOR colEsc = C_WHITE|0xFF;
 
  // Json ->
  static CTextureObject _toBCG;
  bool   bBackgroundLoaded=FALSE;
  try {
		_toBCG.SetData_t(_pNetwork->ga_fnmWorld.NoExt()+".bcg");
		((CTextureData*)_toBCG.GetData())->Force(TEX_CONSTANT);
		static PIXaabbox2D _boxScreen_SE;
		_boxScreen_SE = PIXaabbox2D ( PIX2D(0,0), PIX2D(pixSizeI, pixSizeJ));
		dpHook.PutTexture(&_toBCG, _boxScreen_SE, C_WHITE|255);	
		bBackgroundLoaded=TRUE;
  } catch (char* strError){};

  if (!bBackgroundLoaded) {
	try {
		_toBCG.SetData_t(_pNetwork->ga_fnmWorld.NoExt()+".tbn");
		((CTextureData*)_toBCG.GetData())->Force(TEX_CONSTANT);
		static PIXaabbox2D _boxScreen_SE;
		_boxScreen_SE = PIXaabbox2D ( PIX2D(0,0), PIX2D(pixSizeI, pixSizeJ));
		dpHook.PutTexture(&_toBCG, _boxScreen_SE, C_WHITE|255);	
		bBackgroundLoaded=TRUE;
	} catch (char* strError){};
  }
  // <- Json

  dpHook.Fill(0, pixSizeJ-pixBarSizeJ, pixSizeI, pixBarSizeJ, colBcg);
  dpHook.Fill(0, pixSizeJ-pixBarSizeJ, pixSizeI*pphi->phi_fCompleted, pixBarSizeJ, colBar);
  dpHook.DrawBorder(0, pixSizeJ-pixBarSizeJ, pixSizeI, pixBarSizeJ, colLines);

  dpHook.SetFont( _pfdConsoleFont);
  dpHook.SetTextScaling( 1.0f);
  dpHook.SetTextAspect( 1.0f);
  // print status text
  setlocale(LC_ALL, "");
  CTString strDesc(0, "%s", pphi->phi_strDescription);  strupr((char*)(const char*)strDesc);
  setlocale(LC_ALL, "C");
  CTString strPerc(0, "%3.0f%%", pphi->phi_fCompleted*100);
  //dpHook.PutText(strDesc, pixCharSizeI/2, pixSizeJ-pixBarSizeJ-2-pixCharSizeJ, C_GREEN|255);
  //dpHook.PutTextCXY(strPerc, pixSizeI/2, pixSizeJ-pixBarSizeJ/2+1, C_GREEN|255);
  dpHook.PutText(strDesc, pixCharSizeI/2, pixSizeJ-pixBarSizeJ+pixCharSizeJ/2, colText);
  dpHook.PutTextR(strPerc, pixSizeI-pixCharSizeI/2, pixSizeJ-pixBarSizeJ+pixCharSizeJ/2, colText);
  if (_bUserBreakEnabled && !_pGame->gm_bFirstLoading) {
    dpHook.PutTextC( TRANS( "PRESS ESC TO ABORT"), pixSizeI/2, pixSizeJ-pixBarSizeJ-2-pixCharSizeJ, colEsc);
  }
  if (_pspServer!=NULL) {
  DrawSessionDetails(&dpHook, _pspServer);
  }

/*  
  //LCDPrepare(1.0f);
  //LCDSetDrawport(&dpHook);
  
  // fill the box with background dirt and grid
  //LCDRenderClouds1();
  //LCDRenderGrid();

  // draw progress bar
  PIX pixBarCentI = pixBoxSizeI*1/2;
  PIX pixBarCentJ = pixBoxSizeJ*3/4;
  PIX pixBarSizeI = pixBoxSizeI*7/8;
  PIX pixBarSizeJ = pixBoxSizeJ*3/8;
  PIX pixBarMinI = pixBarCentI-pixBarSizeI/2;
  PIX pixBarMaxI = pixBarCentI+pixBarSizeI/2;
  PIX pixBarMinJ = pixBarCentJ-pixBarSizeJ/2;
  PIX pixBarMaxJ = pixBarCentJ+pixBarSizeJ/2;

  dpBox.Fill(pixBarMinI, pixBarMinJ, 
    pixBarMaxI-pixBarMinI, pixBarMaxJ-pixBarMinJ, C_BLACK|255);
  dpBox.Fill(pixBarMinI, pixBarMinJ, 
    (pixBarMaxI-pixBarMinI)*pphi->phi_fCompleted, pixBarMaxJ-pixBarMinJ, C_GREEN|255);

  // put more dirt
  LCDRenderClouds2Light();

  // draw borders
  COLOR colBorders = LerpColor(C_GREEN, C_BLACK, 200);
  LCDDrawBox(0,-1, PIXaabbox2D(
    PIX2D(pixBarMinI, pixBarMinJ), 
    PIX2D(pixBarMaxI, pixBarMaxJ)), 
    colBorders|255);
  LCDDrawBox(0,-1, PIXaabbox2D(
    PIX2D(0,0), PIX2D(dpBox.GetWidth(), dpBox.GetHeight())), 
    colBorders|255);

  // print status text
  dpBox.SetFont( _pfdDisplayFont);
  dpBox.SetTextScaling( 1.0f);
  dpBox.SetTextAspect( 1.0f);
  // print status text
  CTString strRes;
  strRes.PrintF( "%s", pphi->phi_strDescription);
  //strupr((char*)(const char*)strRes);
  dpBox.PutTextC( strRes, 160, 17, C_GREEN|255);
  strRes.PrintF( "%3.0f%%", pphi->phi_fCompleted*100);
  dpBox.PutTextCXY( strRes, pixBarCentI, pixBarCentJ, C_GREEN|255);
  dpBox.Unlock();

  if( Flesh.gm_bFirstLoading) {
#if USECUSTOMTEXT
    FLOAT fScaling = (FLOAT)slSizeI/640.0f;
    dpHook.Lock();
    dpHook.SetFont( _pfdDisplayFont);
    dpHook.SetTextScaling( fScaling);
    dpHook.SetTextAspect( 1.0f);
    //dpHook.Fill( 0, 0, slSizeI, pixCenterJ, C_vdGREEN|255, C_vdGREEN|255, C_vdGREEN|0, C_vdGREEN|0);
    dpHook.PutTextC( TRANS( "SERIOUS SAM - TEST VERSION"), pixCenterI, 5*fScaling, C_WHITE|255);
    dpHook.PutTextC( TRANS( "THIS IS NOT A DEMO VERSION, THIS IS A COMPATIBILITY TEST!"), pixCenterI, 25*fScaling, C_WHITE|255);
    dpHook.PutTextC( TRANS( "Serious Sam (c) 2000 Croteam LLC, All Rights Reserved.\n"), pixCenterI, 45*fScaling, C_WHITE|255);
    dpHook.PutText( _strCustomText, 1*fScaling, 85*fScaling, C_GREEN|255);
    dpHook.Unlock();
#endif
  } else if (_bUserBreakEnabled) {
    FLOAT fScaling = (FLOAT)slSizeI/640.0f;
    dpHook.Lock();
    dpHook.SetFont( _pfdDisplayFont);
    dpHook.SetTextScaling( fScaling);
    dpHook.SetTextAspect( 1.0f);
    //dpHook.Fill( 0, 0, slSizeI, pixCenterJ, C_vdGREEN|255, C_vdGREEN|255, C_vdGREEN|0, C_vdGREEN|0);
    dpHook.PutTextC( TRANS( "PRESS ESC TO ABORT"), pixCenterI, pixCenterJ+pixBoxSizeJ+5*fScaling, C_WHITE|255);
  }
  */

  dpHook.Unlock();
  // finish rendering
  dpHook.dp_Raster->ra_pvpViewPort->SwapBuffers();

  // keep current time
  tvLast = _pTimer->GetHighPrecisionTimer();
}

// loading hook functions
void CGame::EnableLoadingHook(CDrawPort *pdpDrawport)
{
  _pdpLoadingHook = pdpDrawport;
  SetProgressHook(LoadingHook_t);
}

void CGame::DisableLoadingHook(void)
{
  SetProgressHook(NULL);
  _pdpLoadingHook = NULL;
}
