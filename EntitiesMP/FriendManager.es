2021
%{
#include "StdH.h"
#include "EntitiesMP/Friend.h"
//#include "EntitiesMP/FriendSpawner.h"
%}

enum FriendChangeType {
  0 FCT_SET_MARKER  "Set Marker",
  1 FCT_SET_FLAGS   "Set Flags",
  2 FCT_SET_ENTER_VEHICLE_TRIGGER /*"Set Enter Vehicle Trigger"*/ "!DO NOT USE!",
  3 FCT_TELEPORT    "Teleport and Set Marker",
};

class CFriendManager: CRationalEntity {
name      "FriendManager";
thumbnail "Thumbnails\\AdventureTech\\FriendManager.tex";
features  "HasName", "IsTargetable";

properties:

  1 CTString m_strName          "Name" 'N' = "FriendManager",
  2 CEntityPointer m_penFriend  "Friend/Spawner",

  3 CEntityPointer m_penMarker  "Marker",
  4 flags VisibilityBits m_flBehaviourFlags "Behaviour Flags" = 0,

  5 enum FriendChangeType m_enType "Type" 'Y' = FCT_SET_MARKER,
  
  6 CEntityPointer m_penEnterVehicleTrigger "Enter Vehicle Trigger",

components:

  1 model   MODEL_MARKER     "Models\\Editor\\MessageHolder.mdl",
  2 texture TEXTURE_MARKER   "Models\\Editor\\MessageHolder.tex",


functions:

  BOOL IsTargetValid(SLONG slPropertyOffset, CEntity *penTarget)
  {
    if( slPropertyOffset == offsetof(CFriendManager, m_penFriend))
    {
      return (IsOfClass(penTarget, "Friend") && ((CFriend*)&*penTarget)->m_bTemplate == FALSE) || IsOfClass(penTarget, "FriendSpawner");
    }
    return CEntity::IsTargetValid(slPropertyOffset, penTarget);
  }

  CEntityPointer GetTargetFriend() {
    /*if (IsOfClass(m_penFriend, "FriendSpawner")) {
      return ((CFriendSpawner*)&*m_penFriend)->m_penSpawned;
    }*/

    return m_penFriend;
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

    wait() {
      on (ETrigger eTrigger) : {
        CEntityPointer penTarget = GetTargetFriend();
        if (penTarget != NULL) {
          EFriendChange eFc;
          eFc.penFriendManager = this;
          penTarget->SendEvent(eFc);
        }
        resume;
      }
    }

    Destroy();

    return;
  }
};

