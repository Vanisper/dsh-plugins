export interface DraftModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

export interface DraftModel {
  id: string
  name: string
  description?: string
  reasoning?: { efforts: Array<{ id: string, name: string }>, defaultEffort?: string }
}

export interface DraftOptions {
  current: DraftModelSelection | null
  groups: Array<{ id: string, name: string, models: DraftModel[] }>
  failures: Array<{ id: string, name: string, error: string }>
  permissions?: { currentValue: string, options: Array<{ value: string, name: string, description?: string }> }
}
