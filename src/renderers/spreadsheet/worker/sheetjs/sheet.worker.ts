import {
  createSpreadsheetParserContext,
  handleSpreadsheetWorkerRequest
} from './parser'

const ctx: Worker = self as any

const context = createSpreadsheetParserContext()

ctx.onmessage = async (message) => {
  handleSpreadsheetWorkerRequest(context, message.data).forEach(response => {
    ctx.postMessage(response)
  })
}

ctx.onerror = (err) => {
  console.error(err)
}
