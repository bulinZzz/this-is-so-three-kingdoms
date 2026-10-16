import type { EventDefinition } from './model'

/**
 * 事件数据。新增事件只在此追加一条，不改代码；条件与效果的词表见 `model.ts`，
 * 求值与施加见 `events.ts`。
 *
 * 事件系统是重点机制，任何事件的主题、触发条件、权重、效果与文本都属设计决策：
 * 每条事件在写入数据之前，先与用户完整说明并确认，再落到这里。此处暂不放任何事件。
 */
export const EVENT_DEFINITIONS: readonly EventDefinition[] = []
