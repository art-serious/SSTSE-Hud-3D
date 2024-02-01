8786
%{
#include "StdH.h"
#include "Player.h"
%}

enum SHOP_ITEM_TYPES {
  0  ITEM_NONE                 "00_None",
  1  ITEM_PLR_HEALTH001        "01_Health 1",
  2  ITEM_PLR_HEALTH010        "02_Health 10",
  3  ITEM_PLR_HEALTH025        "03_Health 25",
  4  ITEM_PLR_HEALTH050        "04_Health 50",
  5  ITEM_PLR_HEALTH100        "05_Health 100",
  6  ITEM_PLR_ARMOR001         "06_Armor 1",
  7  ITEM_PLR_ARMOR005         "07_Armor 5",
  8  ITEM_PLR_ARMOR025         "08_Armor 25",
  9  ITEM_PLR_ARMOR050         "09_Armor 50",
  10 ITEM_PLR_ARMOR100         "10_Armor 100",
  11 ITEM_PLR_ARMOR200         "11_Armor 200",
  12 ITEM_AMMO_SHELLS          "12_Shells",
  13 ITEM_AMMO_BULLETS         "13_Bullets",
  14 ITEM_AMMO_ROCKETS         "14_Rockets",
  15 ITEM_AMMO_GRENADES        "15_Grenades",
  16 ITEM_AMMO_NAPALM          "16_Napalm",
  17 ITEM_AMMO_SNIPERBULLETS   "17_Sniper bullets",
  18 ITEM_AMMO_ELECTRICITY     "18_Electricity",
  19 ITEM_AMMO_CANNONBALLS     "19_Cannon balls",
  20 ITEM_WPN_CHAINSAW         "20_Chainsaw",
  21 ITEM_WPN_COLT             "21_Colt",
  22 ITEM_WPN_SINGLESHOTGUN    "22_Shotgun",
  23 ITEM_WPN_DOUBLESHOTGUN    "23_Double shotgun",
  24 ITEM_WPN_TOMMYGUN         "24_Tommygun",
  25 ITEM_WPN_MINIGUN          "25_Minigun",
  26 ITEM_WPN_ROCKETLAUNCHER   "26_Rocket Launcher",
  27 ITEM_WPN_GRENADELAUNCHER  "27_Grenade Launcher",
  28 ITEM_WPN_FLAMER           "28_Flamerthrower",
  29 ITEM_WPN_SNIPER           "29_Sniper Rifle",
  30 ITEM_WPN_LASER            "30_Laser Gun",
  31 ITEM_WPN_IRONCANNON       "31_Cannon SBC",
};

class CShop: CRationalEntity {
name      "Shop";
thumbnail "Thumbnails\\Shop.tbn";
features  "HasName", "IsTargetable";

properties:

  1 CTString m_strName          "Name" 'N' = "Shop",
  2 CTString m_strDescription = "",

  3  enum SHOP_ITEM_TYPES m_enItemType1 "Item type 1" = ITEM_NONE,
  9  INDEX m_iItemValue1 "Item value 1" = 0,
  15 INDEX m_iItemCost1 "Item cost 1" = 0,

  4  enum SHOP_ITEM_TYPES m_enItemType2 "Item type 2" = ITEM_NONE,
  10 INDEX m_iItemValue2 "Item value 2" = 0,
  16 INDEX m_iItemCost2 "Item cost 2" = 0,

  5 enum SHOP_ITEM_TYPES m_enItemType3 "Item type 3" = ITEM_NONE,
  11 INDEX m_iItemValue3 "Item value 3" = 0,
  17 INDEX m_iItemCost3 "Item cost 3" = 0,

  6 enum SHOP_ITEM_TYPES m_enItemType4 "Item type 4" = ITEM_NONE,
  12 INDEX m_iItemValue4 "Item value 4" = 0,
  18 INDEX m_iItemCost4 "Item cost 4" = 0,

  7 enum SHOP_ITEM_TYPES m_enItemType5 "Item type 5" = ITEM_NONE,
  13 INDEX m_iItemValue5 "Item value 5" = 0,
  19 INDEX m_iItemCost5 "Item cost 5" = 0,

  8 enum SHOP_ITEM_TYPES m_enItemType6 "Item type 6" = ITEM_NONE,
  14 INDEX m_iItemValue6 "Item value 6" = 0,
  20 INDEX m_iItemCost6 "Item cost 6" = 0,

  30 CEntityPointer m_penCamera "Camera",

components:

  1 model   MODEL_MARKER     "Models\\Editor\\Shop.mdl",
  2 texture TEXTURE_MARKER   "Models\\Editor\\Shop.tex"


functions:

  INDEX GetItemType(INDEX i) {
    switch (i) {
      case 0: return m_enItemType1;
      case 1: return m_enItemType2;
      case 2: return m_enItemType3;
      case 3: return m_enItemType4;
      case 4: return m_enItemType5;
      case 5: return m_enItemType6;
      default: 
        FatalError("Unknown item type, moron!");
    }
    return 0;
  }

  INDEX GetItemCost(INDEX i) {
    switch (i) {
      case 0: return m_iItemCost1;
      case 1: return m_iItemCost2;
      case 2: return m_iItemCost3;
      case 3: return m_iItemCost4;
      case 4: return m_iItemCost5;
      case 5: return m_iItemCost6;
      default: 
        FatalError("Unknown item cost, moron!");
    }
    return 0;
  }

  INDEX GetItemValue(INDEX i) {
    switch (i) {
      case 0: return m_iItemValue1;
      case 1: return m_iItemValue2;
      case 2: return m_iItemValue3;
      case 3: return m_iItemValue4;
      case 4: return m_iItemValue5;
      case 5: return m_iItemValue6;
      default: 
        FatalError("Unknown item value, moron!");
    }
    return 0;
  }

procedures:


  Main()
  {
    InitAsEditorModel();
    SetPhysicsFlags(EPF_MODEL_IMMATERIAL);
    SetCollisionFlags(ECF_IMMATERIAL);

    // set appearance
    SetModel(MODEL_MARKER);
    SetModelMainTexture(TEXTURE_MARKER);

    autowait(0.1f);

    INDEX iEmptySlots = 0;
    for (int i = 0; i < 6; i++) {
      if (GetItemType(i) == ITEM_NONE) { iEmptySlots++; }
    }

    if (iEmptySlots == 6) {
      WarningMessage("All slots of Shop(" + GetName() + ") is empty! Destroying shop...");
      Destroy();
      return;
    }

    wait() {

      on (ETrigger eTrigger) : {
        if (!IsOfClass(eTrigger.penCaused, "Player")) {
          CPrintF(eTrigger.penCaused->GetName() + " trying to use shop!\n");
          resume;
        }

        if (m_penCamera == NULL) {
          WarningMessage("No suitable camera for Shop, stopping\n");  // Shop can work without Camera, but it's designed to work with it.
          resume;
        }

        CPlayer* player = ((CPlayer*)&*eTrigger.penCaused);
        
        ETrigger eTr;
        eTr.penCaused = eTrigger.penCaused;
        m_penCamera->SendEvent(eTr);

        EShopEntered eShopEntered;
        eShopEntered.penShop = this;
        player->SendEvent(eShopEntered);

        resume;
      };
    }

    return;
  }
};

