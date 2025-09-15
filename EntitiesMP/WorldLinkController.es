8002
%{
#include "StdH.h"
%}

class CWorldLinkController : CRationalEntity {
name      "World link controller";
thumbnail "Thumbnails\\WorldLink.tbn";
features "HasName";

properties:
  1 CTString m_strName     "" = "World link controller",
  2 BOOL     m_bTriggered  = FALSE,
  
components:
  
functions:

procedures:
  // This entity is used to restart level
  RestartLevel(){
    if (_pNetwork->IsServer()) {
        _pNetwork->SendChat(0, -1, TRANS("^cFFFF00All players are dead. The level will be restarted in 10 seconds."));
      }
    m_bTriggered = TRUE;
	  autowait(10.5f);
	  _pNetwork->ChangeLevel(_pNetwork->GetCurrentWorld(), false, 0);
	  return;
  }
/************************************************************
 *                       M  A  I  N                         *
 ************************************************************/
  Main(EVoid) {
    InitAsVoid();
    SetPhysicsFlags(EPF_MODEL_IMMATERIAL);
    SetCollisionFlags(ECF_IMMATERIAL);
	wait(){
		on(ETrigger):{
			INDEX ctActivePlayers=0;
			for(INDEX i=0; i<GetMaxPlayers(); i++) {
				if (GetPlayerEntity(i)!=NULL) {
					CEntityPointer penPlayer=GetPlayerEntity(i);
					if (penPlayer->GetFlags()&ENF_ALIVE){
						ctActivePlayers++;
					}
				}
			}
			if (ctActivePlayers==0) {
				call RestartLevel();
			}
			resume;
		}
	}
    return;
  }
};
