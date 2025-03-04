import debug from 'debug';
import ts from 'typescript';

import type { ResponseItem, TypeDeriver } from '@sdk-it/core';

const logger = debug('@sdk-it/hono');

const handlerVisitor: (
  on: (
    node: ts.Node,
    statusCode: ts.Node | undefined,
    headers: ts.Node | undefined,
    contentType: string,
  ) => void,
  contextVarName: string,
) => ts.Visitor = (callback, contextVarName) => {
  return (node: ts.Node) => {
    if (ts.isReturnStatement(node) && node.expression) {
      if (
        ts.isCallExpression(node.expression) &&
        ts.isPropertyAccessExpression(node.expression.expression)
      ) {
        const propAccess = node.expression.expression;
        if (
          ts.isIdentifier(propAccess.expression) &&
          propAccess.expression.text === contextVarName
        ) {
          let contentType = 'application/json';
          const callerMethod = propAccess.name.text;
          if (callerMethod === 'body') {
            contentType = 'application/octet-stream';
          }
          const [body, statusCode, headers] = node.expression.arguments;
          callback(body, statusCode, headers, contentType);
        }
      }
    }
    return ts.forEachChild(node, handlerVisitor(callback, contextVarName));
  };
};

function toResponses(handler: ts.ArrowFunction, deriver: TypeDeriver) {
  const contextVarName = handler.parameters[0].name.getText();
  const responsesList: ResponseItem[] = [];
  const visit = handlerVisitor((node, statusCode, headers, contentType) => {
    responsesList.push({
      headers: headers ? Object.keys(deriver.serializeNode(headers)) : [],
      contentType,
      statusCode: statusCode ? resolveStatusCode(statusCode) : '200',
      response: deriver.serializeNode(node),
    });
  }, contextVarName);
  visit(handler.body);
  return responsesList;
}

function resolveStatusCode(node: ts.Node) {
  if (ts.isNumericLiteral(node)) {
    return node.text;
  }
  throw new Error(`Could not resolve status code`);
}

export function responseAnalyzer(
  handler: ts.ArrowFunction,
  deriver: TypeDeriver,
) {
  return toResponses(handler, deriver);
}
