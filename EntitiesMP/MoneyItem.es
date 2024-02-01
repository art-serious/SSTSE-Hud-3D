899
%{
#include "StdH.h"
#include "Models/Items/ItemHolder/ItemHolder.h"
%}

uses "EntitiesMP/Item";

// money type 
enum MoneyItemType {
  0 MIT_COIN      "Coin",     // coin money
  1 MIT_BAG       "Bag",      // bag money
  2 MIT_CHEST     "Chest",    // chest moeny
  3 MIT_CUSTOM    "DO NOT USE!",  // custom
};

// event for sending through receive item
event EMoneyItem {
  INDEX iMoney,        // money to receive
  BOOL  bPredictor,
  BOOL  bDroppedByEnemy,
};
event EMoneyItemInit {
  INDEX iMoney,
  MoneyItemType iMoneyType,
};

class CMoneyItem : CItem {
name      "Money Item";
thumbnail "Thumbnails\\MoneyItem.tbn";

properties:
  1 enum MoneyItemType m_EhitType    "Type" 'Y' = MIT_BAG,     // money type
  2 INDEX m_iSoundComponent = 0,
  3 BOOL  m_bDroppedByEnemy = FALSE,

components:
  0 class   CLASS_BASE        "Classes\\Item.ecl",

// ********* COIN MONEY *********
  1 model   MODEL_COIN        "Models\\Items\\Money\\Coin\\Coin.mdl",
  2 texture TEXTURE_COIN      "Models\\Items\\Money\\Coin\\Coin.tex",

// ********* BAG MONEY *********
 10 model   MODEL_BAG         "Models\\Items\\Money\\Bag\\Bag.mdl",
 11 texture TEXTURE_BAG       "Models\\Items\\Money\\Bag\\Bag.tex",

// ********* CHEST MONEY *********
 20 model   MODEL_CHEST      "Models\\Items\\Money\\Chest\\Chest.mdl",
 21 texture TEXTURE_CHEST    "Models\\Items\\Money\\Chest\\Chest.tex",

// ********* MISC *********
 50 texture TEXTURE_SPECULAR_STRONG "Models\\SpecularTextures\\Strong.tex",
 51 texture TEXTURE_SPECULAR_MEDIUM "Models\\SpecularTextures\\Medium.tex",
 52 texture TEXTURE_REFLECTION_LIGHTMETAL01 "Models\\ReflectionTextures\\LightMetal01.tex",
 53 texture TEXTURE_REFLECTION_GOLD01 "Models\\ReflectionTextures\\Gold01.tex",
 54 texture TEXTURE_REFLECTION_PUPLE01 "Models\\ReflectionTextures\\Purple01.tex",
 55 texture TEXTURE_FLARE "Models\\Items\\Flares\\Flare.tex",
 56 model   MODEL_FLARE "Models\\Items\\Flares\\Flare.mdl",

// ************** SOUNDS **************
301 sound   SOUND_COIN         "Sounds\\Items\\Money.wav",
302 sound   SOUND_BAG          "Sounds\\Items\\Money.wav",
303 sound   SOUND_CHEST        "Sounds\\Items\\Money.wav",

functions:
  void Precache(void) {
    switch (m_EhitType) {
      case MIT_COIN:   PrecacheSound(SOUND_COIN  ); break;
      case MIT_BAG:  PrecacheSound(SOUND_BAG ); break;                                      
      case MIT_CHEST: PrecacheSound(SOUND_CHEST); break;
      case MIT_CUSTOM: PrecacheSound(SOUND_BAG); break;
    }
  }
  /* Fill in entity statistics - for AI purposes only */
  BOOL FillEntityStatistics(EntityStats *pes)
  {
    pes->es_strName = "Money"; 
    pes->es_ctCount = 1;
    pes->es_ctAmmount = m_fValue;
    pes->es_fValue = m_fValue;
    pes->es_iScore = 0;//m_iScore;
    
    switch (m_EhitType) {
      case MIT_COIN:  pes->es_strName+=" coin";   break;
      case MIT_BAG: pes->es_strName+=" bag";  break;
      case MIT_CHEST:pes->es_strName+=" chest"; break;
      case MIT_CUSTOM:pes->es_strName+=" custom"; break;
    }

    return TRUE;
  }

  // render particles
  void RenderParticles(void) {
    // no particles when not existing
    if (GetRenderType()!=CEntity::RT_MODEL || !ShowItemParticles())
    {
      return;
    }

    switch (m_EhitType) {
      case MIT_COIN:
        Particles_Stardust(this, 1.0f, 1.0f, PT_STAR08, 32);
        break;
      case MIT_BAG:
        Particles_Stardust(this, 1.5f, 1.0f, PT_STAR08, 128);
        break;
      case MIT_CHEST:
        Particles_Stardust(this, 1.5f, 1.0f, PT_STAR08, 128);
        break;
	  case MIT_CUSTOM:
        Particles_Stardust(this, 1.0f, 1.0f, PT_STAR08, 128);
        break;
    }
  }

  // set money properties depending on money type
  void SetProperties(void) {
    switch (m_EhitType) {
      case MIT_COIN:
        StartModelAnim(ITEMHOLDER_ANIM_SMALLOSCILATION, AOF_LOOPING|AOF_NORESTART);
        ForceCollisionBoxIndexChange(ITEMHOLDER_COLLISION_BOX_SMALL);
        m_fValue = 5.0f;
        m_fRespawnTime = (m_fCustomRespawnTime>0) ? m_fCustomRespawnTime : 20.0f; 
        m_strDescription.PrintF("Coin - M:%g  T:%g", m_fValue, m_fRespawnTime);
        // set appearance
        AddItem(MODEL_COIN, TEXTURE_COIN, 0, TEXTURE_SPECULAR_STRONG, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.2f,0), FLOAT3D(1,1,0.3f) );
        StretchItem(FLOAT3D(1.0f*0.75f, 1.0f*0.75f, 1.0f*0.75));
        m_iSoundComponent = SOUND_COIN;
        break;
      case MIT_BAG:
        StartModelAnim(ITEMHOLDER_ANIM_SMALLOSCILATION, AOF_LOOPING|AOF_NORESTART);
        ForceCollisionBoxIndexChange(ITEMHOLDER_COLLISION_BOX_MEDIUM);
        m_fValue = 10.0f;
        m_fRespawnTime = (m_fCustomRespawnTime>0) ? m_fCustomRespawnTime : 50.0f; 
        m_strDescription.PrintF("Bag - M:%g  T:%g", m_fValue, m_fRespawnTime);
        // set appearance
        AddItem(MODEL_BAG, TEXTURE_BAG, TEXTURE_REFLECTION_LIGHTMETAL01, TEXTURE_SPECULAR_MEDIUM, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.4f,0), FLOAT3D(2,2,0.4f) );
        StretchItem(FLOAT3D(2.0f*0.75f, 2.0f*0.75f, 2.0f*0.75));
        m_iSoundComponent = SOUND_BAG;
        break;
      case MIT_CHEST:
        StartModelAnim(ITEMHOLDER_ANIM_SMALLOSCILATION, AOF_LOOPING|AOF_NORESTART);
        ForceCollisionBoxIndexChange(ITEMHOLDER_COLLISION_BOX_MEDIUM);
        m_fValue = 50.0f;
        m_fRespawnTime = (m_fCustomRespawnTime>0) ? m_fCustomRespawnTime : 125.0f; 
        m_strDescription.PrintF("Chest - M:%g  T:%g", m_fValue, m_fRespawnTime);
        // set appearance
        AddItem(MODEL_CHEST, TEXTURE_CHEST, TEXTURE_REFLECTION_LIGHTMETAL01, TEXTURE_SPECULAR_MEDIUM, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.6f,0), FLOAT3D(2.5f,2.5f,0.5f) );
        StretchItem(FLOAT3D(1.5f*0.75f, 1.5f*0.75f, 1.5f*0.75));
        m_iSoundComponent = SOUND_CHEST;
        break;
	  case MIT_CUSTOM: // This case used by dropped money from players
        StartModelAnim(ITEMHOLDER_ANIM_SMALLOSCILATION, AOF_LOOPING|AOF_NORESTART);
        ForceCollisionBoxIndexChange(ITEMHOLDER_COLLISION_BOX_MEDIUM);
        m_fRespawnTime = (m_fCustomRespawnTime>0) ? m_fCustomRespawnTime : 20.0f; 
        m_strDescription.PrintF("Custom - M:%g  T:%g", m_fValue, m_fRespawnTime);
        // set appearance
        AddItem(MODEL_BAG, TEXTURE_BAG, TEXTURE_REFLECTION_LIGHTMETAL01, TEXTURE_SPECULAR_MEDIUM, 0);
        // add flare
        AddFlare(MODEL_FLARE, TEXTURE_FLARE, FLOAT3D(0,0.6f,0), FLOAT3D(2.5f,2.5f,0.5f) );
        StretchItem(FLOAT3D(1.5f*0.75f, 1.5f*0.75f, 1.5f*0.75));
        m_iSoundComponent = SOUND_BAG;
        break;

    }
  };
procedures:
  ItemCollected(EPass epass) : CItem::ItemCollected {
    ASSERT(epass.penOther!=NULL);
    // if money stays
    if (!(m_bPickupOnce||m_bRespawn)) {
      // if already picked by this player
      BOOL bWasPicked = MarkPickedBy(epass.penOther);
      if (bWasPicked) {
        // don't pick again
        return;
      }
    }

    // send money to entity
    EMoneyItem eMoney;
	  eMoney.bPredictor=IsPredictor();
    eMoney.iMoney = (INDEX)m_fValue;
	  eMoney.bDroppedByEnemy = m_bDroppedByEnemy;
    // if money is received
    if (epass.penOther->ReceiveItem(eMoney)) {

      if(_pNetwork->IsPlayerLocal(epass.penOther))
      {
        switch (m_EhitType)
        {
          case MIT_COIN: IFeel_PlayEffect("PU_MoneyCoin");  break;
          case MIT_BAG:  IFeel_PlayEffect("PU_MoneyBag");   break;
          case MIT_CHEST:IFeel_PlayEffect("PU_MoneyChest"); break;
        }
      }

      // play the pickup sound
      m_soPick.Set3DParameters(50.0f, 1.0f, 1.0f, 1.0f);
      PlaySound(m_soPick, m_iSoundComponent, SOF_3D);
      m_fPickSoundLen = GetSoundLength(m_iSoundComponent);
      jump CItem::ItemReceived();
    }
    return;
  };

  Main() {
	Initialize();     // initialize base class
    SetProperties();  // set properties
	SetCollisionFlags(ECF_ITEM_MONEY);

	if (!m_bDropped) {
      jump CItem::ItemLoop();
    } else if (TRUE) {
      wait() {
        on (EBegin) : {
          SpawnReminder(this, m_fRespawnTime, 0);
          call CItem::ItemLoop();
        }
        on (EReminder) : {
          SendEvent(EEnd()); 
          resume;
        }
      }
    }

  };
};
