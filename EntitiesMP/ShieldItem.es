898
%{
#include "StdH.h"
#include "Models/Items/ItemHolder/ItemHolder.h"
%}

uses "EntitiesMP/Item";

// health type 
enum ShieldItemType {
  0 SHIT_SHIELD_25        "Shield +25",    // small armor
  1 SHIT_SHIELD_5         "Shield +5",     // helm
};

// event for sending through receive item
event EMaxShield {
  FLOAT fMaxShield,         // shield to receive
};

class CShieldItem : CItem {
name      "Shield Item";
thumbnail "Thumbnails\\ShieldItem.tbn";

properties:
  1 enum ShieldItemType m_EaitType     "Type" 'Y' = SHIT_SHIELD_25,    // armor type
  2 INDEX m_iSoundComponent = 0,

components:
  0 class   CLASS_BASE        "Classes\\Item.ecl",

// ********* SHIELD +25 *********
 10 model   MODEL_25       "Models\\Items\\Shield\\Shield_25.mdl",
 11 texture TEXTURE_25     "Models\\Items\\Shield\\Shield_25.tex",

// ********* SHIELD +5  *********
 20 model   MODEL_5        "Models\\Items\\Shield\\Shield_5.mdl",
 21 texture TEXTURE_5      "Models\\Items\\Shield\\Shield_5.tex",

// ************** FLARE FOR EFFECT **************
100 texture TEXTURE_FLARE  "Models\\Items\\Flares\\Flare.tex",
101 model   MODEL_FLARE    "Models\\Items\\Flares\\Flare.mdl",

// ************** REFLECTIONS **************
200 texture TEX_REFL_LIGHTMETAL01       "Models\\ReflectionTextures\\LightMetal01.tex",

// ************** SPECULAR **************
210 texture TEX_SPEC_MEDIUM             "Models\\SpecularTextures\\Medium.tex",

// ************** SOUNDS **************
300 sound   SOUND_SHIELD_25        "Sounds\\Items\\Shield25.wav",
301 sound   SOUND_SHIELD_5         "Sounds\\Items\\Shield5.wav",

functions:
  void Precache(void) {
    switch (m_EaitType) {
      case SHIT_SHIELD_25:  PrecacheSound(SOUND_SHIELD_25 ); break;                                      
      case SHIT_SHIELD_5:   PrecacheSound(SOUND_SHIELD_5  ); break;
    }
  }
  /* Fill in entity statistics - for AI purposes only */
  BOOL FillEntityStatistics(EntityStats *pes)
  {
    pes->es_strName = "Energy shield"; 
    pes->es_ctCount = 1;
    pes->es_ctAmmount = m_fValue;
    pes->es_fValue = m_fValue*100;
    pes->es_iScore = 0;//m_iScore;
    switch (m_EaitType) {
      case SHIT_SHIELD_25:  pes->es_strName+=" 25";  break;                                      
      case SHIT_SHIELD_5:   pes->es_strName+=" 5";   break;
    }
    return TRUE;
  }

  // render particles
  void RenderParticles(void) {
    // no particles when not existing or in DM modes
    if (GetRenderType()!=CEntity::RT_MODEL || GetSP()->sp_gmGameMode>CSessionProperties::GM_COOPERATIVE
      || !ShowItemParticles())
    {
      return;
    }
    switch (m_EaitType) {
      case SHIT_SHIELD_25:
        Particles_Emanate(this, 1.0f*0.75, 1.0f*0.75, PT_STAR04, 32, 7.0f);
        break;                                      
      case SHIT_SHIELD_5:
        Particles_Emanate(this, 0.875f*0.75, 0.875f*0.75, PT_STAR04, 16, 7.0f);
        break;      
    }
  }

  // set shield properties depending on shield type
  void SetProperties(void) {
    switch (m_EaitType) {
      case SHIT_SHIELD_25:
        ForceCollisionBoxIndexChange(ITEMHOLDER_COLLISION_BOX_MEDIUM);
        m_fValue = 25.0f;
        m_fRespawnTime = (m_fCustomRespawnTime>0) ? m_fCustomRespawnTime : 10.0f; 
        m_strDescription.PrintF("Shield +25 - H:%g  T:%g", m_fValue, m_fRespawnTime);
        // set appearance
        AddItem(MODEL_25, TEXTURE_25, TEX_REFL_LIGHTMETAL01, TEX_SPEC_MEDIUM, 0);
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.6f,0), FLOAT3D(2,2,0.5f) );
        StretchItem(FLOAT3D(2.0f, 2.0f, 2.0f));
        m_iSoundComponent = SOUND_SHIELD_25;
        break;
      case SHIT_SHIELD_5:
        ForceCollisionBoxIndexChange(ITEMHOLDER_COLLISION_BOX_SMALL);
        m_fValue = 5.0f;
        m_fRespawnTime = (m_fCustomRespawnTime>0) ? m_fCustomRespawnTime : 10.0f; 
        m_strDescription.PrintF("Shield +5 - H:%g  T:%g", m_fValue, m_fRespawnTime);
        // set appearance
        AddItem(MODEL_5, TEXTURE_5, 0, TEX_SPEC_MEDIUM, 0);
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.5f,0), FLOAT3D(1.5,1.5,0.4f) );
        StretchItem(FLOAT3D(0.875f*0.75, 0.875f*0.75, 0.875f*0.75));
        m_iSoundComponent = SOUND_SHIELD_5;
        break;        
    }
  };

/*  void AdjustDifficulty(void)
  {
    if (!GetSP()->sp_bAllowArmor && m_penTarget==NULL) {
      Destroy();
    }
  }*/

procedures:
  ItemCollected(EPass epass) : CItem::ItemCollected {
    ASSERT(epass.penOther!=NULL);

    // if shield stays
    if (/*GetSP()->sp_bHealthArmorStays &&*/ !(m_bPickupOnce||m_bRespawn)) {
      // if already picked by this player
      BOOL bWasPicked = MarkPickedBy(epass.penOther);
      if (bWasPicked) {
        // don't pick again
        return;
      }
    }

    // send shield to entity
    EMaxShield eMaxShield;
    eMaxShield.fMaxShield = m_fValue;
    // if shield is received
    if (epass.penOther->ReceiveItem(eMaxShield)) {

      if(_pNetwork->IsPlayerLocal(epass.penOther))
      {
        switch (m_EaitType)
        {
          case SHIT_SHIELD_25:  IFeel_PlayEffect("PU_Shield_25"); break;
          case SHIT_SHIELD_5:   IFeel_PlayEffect("PU_Shield_5" ); break; 
        }
      }

      // play the pickup sound
      m_soPick.Set3DParameters(50.0f, 1.0f, 1.0f, 1.0f);
      PlaySound(m_soPick, m_iSoundComponent, SOF_3D);
      m_fPickSoundLen = GetSoundLength(m_iSoundComponent);

      if (/*!GetSP()->sp_bHealthArmorStays || */(m_bPickupOnce||m_bRespawn)) {
        jump CItem::ItemReceived();
      }
    }
    return;
  };

  Main() {
    Initialize();     // initialize base class
    StartModelAnim(ITEMHOLDER_ANIM_SMALLOSCILATION, AOF_LOOPING|AOF_NORESTART);
    SetProperties();  // set properties

    jump CItem::ItemLoop();
  };
};
