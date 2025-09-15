895
%{
#include "StdH.h"
#include "EntitiesMP/EnemyBase.h"
#include "EntitiesMP/EnemySpawner.h"
#include "EntitiesMP/Trigger.h"
#include "EntitiesMP/Woman.h"
#include "EntitiesMP/Player.h"

  extern INDEX hud_bShowNickname;
%}

event EPlayerDeath {
};

class CGameStat : CRationalEntity {
name      "GameStat";
thumbnail "Thumbnails\\Trigger.tbn";
features "IsImportant", "HasName";

properties:
 1 CTString m_strName     "" = "GameStat",
10 FLOAT m_fLevelTime        = -1.0f, // Time point when the level was started
11 INDEX m_iLevelScore       =    0,  // Score of current level, needed for giving extra credits in co-op mode
12 INDEX m_iCurrentMilestone =    0,  // Case number of Milestone
13 INDEX m_iEnemyCount       =    0,  // Containes a count of killed enemies.  The player is not a reliable container of the "monsters killed" counter.
14 INDEX m_iSecretCount      =    0,  // Containes a count of founded secrets. The player is not a reliable container of the "secrets found" counter.
15 INDEX m_iCreditsUsed      =    0,
16 CSoundObject m_soExtraLife,

components:
  1 model   MODEL_MARKER       "Models\\Editor\\Axis.mdl",
  2 texture TEXTURE_MARKER     "Models\\Editor\\Vector.tex",
  3 sound   SOUND_EXTRA_CREDIT "Sounds\\Misc\\ExtraLife.wav",

functions:
  INDEX GetNextMilestonePoints() { //for Survival co-op
		switch (m_iCurrentMilestone) {
			case 0:  return 25000;
			case 1:  return 50000;
			case 2:  return 100000;
			case 3:  return 200000;
			case 4:  return 500000;
			case 5:  return 1000000;  //  1m
			case 6:  return 2000000;  //  2m
			case 7:  return 5000000;  //  5m
			case 8:  return 10000000; // 10m
			case 9:  return 25000000; // 25m
			case 10: return 50000000; // 50m
		}
      return MAX_SLONG;
	  }

    // Handle an event, return false if the event is not handled.
  BOOL HandleEvent(const CEntityEvent &ee) {
    if (ee.ee_slEvent==EVENTCODE_EKilledEnemy) {
      m_iEnemyCount++;
    }

    if (ee.ee_slEvent==EVENTCODE_ESecretFound) {
      m_iSecretCount++;
    }

    /*if (ee.ee_slEvent==EVENTCODE_EPlayerDeath) {
      m_iDeathCount++;
    }*/

    if (ee.ee_slEvent == EVENTCODE_EReceiveScore) {
      INDEX iPreviousLevelScore = m_iLevelScore;

      EReceiveScore eReceiveScore = ((EReceiveScore &)ee);
      m_iLevelScore += eReceiveScore.iPoints;

      CSessionProperties *pSP = (CSessionProperties *)GetSP();

      // increment credits
      if (pSP->sp_ctCredits != -1 && pSP->sp_bIncrementCredit) {
        INDEX iMilestonesHit = 0;

        while (GetNextMilestonePoints() <= m_iLevelScore) {
          m_iCurrentMilestone++;
          iMilestonesHit++;
        }

        if (iMilestonesHit > 0) {
          BOOL bAllPlayersAlive = TRUE;
          for (INDEX iPlayer = 0; iPlayer < GetMaxPlayers(); iPlayer++) {
            CPlayer *ppl = (CPlayer *)&*GetPlayerEntity(iPlayer);
            if (ppl == NULL) {
              continue;
            }
            // if someone is dead during increment and CreditsLeft=0, revive all
            // players
            if (!(ppl->GetFlags() & ENF_ALIVE) && pSP->sp_ctCreditsLeft == 0) {
              ppl->SendEvent(EEnd());
              bAllPlayersAlive = FALSE;
            }
          }
          if (bAllPlayersAlive) {
            CPrintF(TRANS("The team received an extra credit!\n"));
            m_soExtraLife.Set3DParameters(50.0f, 50.0f, 1.0, 1.0f);
            PlaySound(m_soExtraLife, SOUND_EXTRA_CREDIT, SOF_LOCAL);
          } else {
            iMilestonesHit--;
            m_iCreditsUsed++;
            //CPrintF("^cffff00m_iCreditsUsed=%i - Mass ressurect\n", m_iCreditsUsed);
            CPrintF(TRANS("Fallen players are riding the gun again\n"));
          }
          pSP->sp_ctCreditsLeft += iMilestonesHit;
        }
      }
      return TRUE;
    }

    return CRationalEntity::HandleEvent(ee);
  }
  
procedures:
  // initialize
  Main(EVoid) {

    // init as model
    InitAsEditorModel();
    SetPhysicsFlags(EPF_MODEL_IMMATERIAL);
    SetCollisionFlags(ECF_IMMATERIAL);

    // set appearance
    SetModel(MODEL_MARKER);
    SetModelMainTexture(TEXTURE_MARKER);

    // wait for game to start
    autowait(_pTimer->TickQuantum);
	if (m_fLevelTime<0) {
		m_fLevelTime=_pTimer->CurrentTick();
	}

  }
};
