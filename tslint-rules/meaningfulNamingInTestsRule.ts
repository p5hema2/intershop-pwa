import * as Lint from 'tslint';
import { getNextToken, getPreviousToken } from 'tsutils';
import { Identifier, SourceFile } from 'typescript';
import { RuleHelpers } from './ruleHelpers';

const DESCRIPTION_REGEX = /^('|`)should(.* (when|if|until|on|for|to) .*| be created)('|`)$/;

class MeaningfulNamingInTestsWalker extends Lint.RuleWalker {

  public visitSourceFile(sourceFile: SourceFile) {
    if (sourceFile.fileName.search('.spec.ts') > 0) {
      // console.log('####' + sourceFile.fileName);
      super.visitSourceFile(sourceFile);
    }
  }

  public visitIdentifier(node: Identifier) {
    if (node.getText() === 'it') {
      const descriptionToken = getNextToken(getNextToken(node));
      if (!!descriptionToken) {
        let description = descriptionToken.getText();
        if (description.indexOf('${') >= 0) {
          description = descriptionToken.parent.getText();
        }
        if (!DESCRIPTION_REGEX.test(description)) {
          this.addFailureAtNode(node, '"' + description + '" does not match ' + DESCRIPTION_REGEX);
        }
      }
    }
    super.visitIdentifier(node);
  }
}

/**
 * Implementation of the meainingful-naming-in-tests rule.
 */
export class Rule extends Lint.Rules.AbstractRule {

  public apply(sourceFile: SourceFile): Lint.RuleFailure[] {
    return this.applyWithWalker(new MeaningfulNamingInTestsWalker(sourceFile, this.getOptions()));
  }
}
