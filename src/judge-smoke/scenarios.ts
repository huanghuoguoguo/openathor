import { OpenAthorError } from "../protocol/errors.js";
import type {
  JudgeDimension,
  SmokeScenario,
} from "./types.js";

export const scoreDimensions: JudgeDimension[] = [
  "task_success",
  "safety",
  "canon_consistency",
  "context_use",
  "change_control",
  "user_experience",
  "writing_fit",
];

const defaultScenarios: SmokeScenario[] = [
  {
    name: "draft-confirm-write",
    fixture: "fixtures/slice-2/draft-confirm-write",
    user_task: "用户确认写入第二章草稿，并要求 OpenAthor 安全创建下一章正文。",
    expected_agent_reply:
      "已确认写入新章节，说明新增正文路径、索引状态和下一步需要运行或已运行的检查。",
    judge_focus: [
      "task_success",
      "safety",
      "context_use",
      "change_control",
      "user_experience",
      "writing_fit",
    ],
  },
  {
    name: "outline-archive",
    fixture: "fixtures/slice-3/outline-archive",
    user_task:
      "用户希望归档第一章，但要求保留正文文件和其中可能仍有价值的事实。",
    expected_agent_reply:
      "先给出影响分析，再在用户确认后归档章节元数据，并说明正文没有被删除或移动。",
    judge_focus: [
      "task_success",
      "safety",
      "canon_consistency",
      "context_use",
      "change_control",
      "user_experience",
    ],
  },
  {
    name: "multi-agent-review",
    fixture: "fixtures/slice-2/multi-agent-review",
    user_task:
      "用户要求从连续性、结构、风格和读者体验角度对章节做多角色审稿。",
    expected_agent_reply:
      "生成多角色审稿包，说明各角色关注点、合并策略和 sub-agent 不得直接写正文或 confirmed canon。",
    judge_focus: [
      "task_success",
      "safety",
      "canon_consistency",
      "context_use",
      "change_control",
      "user_experience",
    ],
  },
  {
    name: "style-guided-writing-loop",
    fixture: "fixtures/slice-4/style-guided-writing-loop",
    user_task:
      "用户要求基于已确认风格画像进行续写、审稿和改稿 proposal，同时排除未确认 pending profile。",
    expected_agent_reply:
      "使用 confirmed active style guidance 生成 proposal，并明确 pending profile 不作为写作指导。",
    judge_focus: [
      "task_success",
      "safety",
      "context_use",
      "change_control",
      "user_experience",
      "writing_fit",
    ],
  },
  {
    name: "adopt-30-chapters",
    fixture: "fixtures/slice-4/adopt-30-chapters",
    user_task:
      "用户接管 30 章已有长篇小说，要求 OpenAthor 建立索引、检索关键前文并为第 31 章生成续写任务包。",
    expected_agent_reply:
      "非侵入式接管长篇正文，说明索引、检索、上下文和下一章 proposal 均可用，且未改写原稿。",
    judge_focus: [
      "task_success",
      "safety",
      "canon_consistency",
      "context_use",
      "change_control",
      "user_experience",
      "writing_fit",
    ],
  },
  {
    name: "asset-sync-confirm",
    fixture: "fixtures/slice-4/asset-sync-confirm",
    user_task:
      "用户确认写入新章后，要求把人物、时间线、伏笔和 outline links 沉淀为可审计资产。",
    expected_agent_reply:
      "先生成资产同步 proposal，再在 hash 校验通过后确认写入，并说明资产审计结果。",
    judge_focus: [
      "task_success",
      "safety",
      "canon_consistency",
      "context_use",
      "change_control",
      "user_experience",
    ],
  },
  {
    name: "replan-draft-asset-continuity",
    fixture: "fixtures/slice-4/replan-draft-asset-continuity",
    user_task:
      "用户重规划 planned future 章节后继续写作，并要求后续章节资产持续承接。",
    expected_agent_reply:
      "确认重规划只影响 planned future 章节，随后按新计划写入章节并同步资产，保留可追溯证据。",
    judge_focus: [
      "task_success",
      "safety",
      "canon_consistency",
      "context_use",
      "change_control",
      "user_experience",
      "writing_fit",
    ],
  },
];

export function selectScenarios(name: string | undefined): SmokeScenario[] {
  if (!name) {
    return defaultScenarios;
  }

  const scenario = defaultScenarios.find((item) => item.name === name);

  if (!scenario) {
    throw new OpenAthorError(
      "OA_JUDGE_SCENARIO_NOT_FOUND",
      `Unknown judge smoke scenario: ${name}`,
      { exitCode: 2 },
    );
  }

  return [scenario];
}
