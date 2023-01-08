import ts, { Identifier, NodeFlags, factory } from "typescript";
import {} from "ts-expose-internals";
import { TransformerState } from "./transformer";

// the main part of the transformer

export class ComponentState {
	public vars = new Array<ManagedVariableDeclaration>();
	// [0]: get, [1]: set
	public symbols = new Map<String, [string, string]>();
	constructor(
		public transformation_state: TransformerState,
		public node: ts.FunctionDeclaration
	) {}
	public transform() {
		/**
		 * we'd usually use FunctionDeclaration.locals to get the variables
		 * but we also need to know if it is `const` or `let`
		 * which it does not tell us
		 *
		 */
		const node = this.node;
		const body = this.replace_references(this.transform_block(node.body!));
		return factory.updateFunctionDeclaration(
			node,
			node.modifiers,
			node.asteriskToken,
			node.name,
			node.typeParameters,
			node.parameters,
			node.type,
			body
		);
	}
	public replace_references(node: ts.Block): ts.Block {
		const typechecker = this.transformation_state.type_checker;
		const assignments_at_pos = new Map<Number, ts.Node>();
		const visit_node = <T extends ts.Node>(node: T): T => {
			if (ts.isBinaryExpression(node)) {
				const left = node.left;
				const right = node.right;
				if (ts.isIdentifier(left) && is_mutable_binary_op(node)) {
					const symbol = typechecker.getSymbolAtLocation(left);

					if (symbol) {
						const symbol_name = symbol.escapedName.toString();
						if (this.symbols.has(symbol_name)) {
							const [get, set] = this.symbols.get(symbol_name)!;
							const set_identifier = factory.createIdentifier(set);
							const binary_op = factory.updateBinaryExpression(
								node,
								factory.createIdentifier(get),
								node.operatorToken,
								node.right
							);
							assignments_at_pos.set(
								left.pos,
								factory.createCallExpression(set_identifier, undefined, [
									expand_binary_rhs(binary_op),
								]) as never
							);

							return (factory.createCallExpression(
								factory.createIdentifier(set),
								undefined,
								[expand_binary_rhs(binary_op)]
							) as never) as T;
						}
					}
				}
			}
			if (ts.isIdentifier(node)) {
				const symbol = typechecker.getSymbolAtLocation(node);
				if (assignments_at_pos.has(node.pos)) {
					return (assignments_at_pos.get(node.pos)! as never) as T;
				}
				if (symbol) {
					const symbol_name = symbol.escapedName.toString();

					if (this.symbols.has(symbol_name)) {
						const [get, set] = this.symbols.get(symbol_name)!;

						return (factory.createIdentifier(get) as never) as T;
					}
				}
			}
			return ts.visitEachChild(
				node,
				visit_node,
				this.transformation_state.transformation_context
			);
		};

		return visit_node(node);
	}
	public transform_block(node: ts.Block): ts.Block {
		const statements = node.statements.map((statement) => {
			return this.transform_statement(statement);
		});
		return factory.updateBlock(node, statements);
	}
	public transform_statement(node: ts.Statement): ts.Statement {
		if (ts.isVariableStatement(node)) {
			return this.transform_variable_statement(node);
		}
		return node;
	}
	public transform_variable_statement(
		node: ts.VariableStatement
	): ts.VariableStatement {
		const dec_list = node.declarationList;
		const is_const = !!(dec_list.flags & NodeFlags.Const);
		return factory.updateVariableStatement(
			node,
			undefined,
			factory.updateVariableDeclarationList(
				dec_list,
				!is_const
					? dec_list.declarations.map((variable_dec, _1, _2) => {
							const variable: ManagedVariableDeclaration = new ManagedVariableDeclaration(
								variable_dec,
								this
							);

							return variable.transform();
					  })
					: dec_list.declarations
			)
		);
	}
}
function is_mutable_binary_op(binary: ts.BinaryExpression): boolean {
	switch (binary.operatorToken.kind) {
		case ts.SyntaxKind.PlusEqualsToken:
		case ts.SyntaxKind.MinusEqualsToken:
		case ts.SyntaxKind.SlashEqualsToken:
		case ts.SyntaxKind.AsteriskEqualsToken:
			return true;
		default:
			return false;
	}
}
function expand_binary_rhs(expr: ts.BinaryExpression): ts.Expression {
	const kind = expr.operatorToken.kind;
	switch (kind) {
		case ts.SyntaxKind.PlusEqualsToken: {
			return factory.createBinaryExpression(
				expr.left,
				factory.createToken(ts.SyntaxKind.PlusToken),
				expr.right
			);
		}
		case ts.SyntaxKind.MinusEqualsToken: {
			return factory.createBinaryExpression(
				expr.left,
				factory.createToken(ts.SyntaxKind.MinusToken),
				expr.right
			);
		}
		case ts.SyntaxKind.AsteriskEqualsToken: {
			return factory.createBinaryExpression(
				expr.left,
				factory.createToken(ts.SyntaxKind.AsteriskToken),
				expr.right
			);
		}
		case ts.SyntaxKind.SlashEqualsToken: {
			return factory.createBinaryExpression(
				expr.left,
				factory.createToken(ts.SyntaxKind.SlashToken),
				expr.right
			);
		}
	}

	if (ts.isTokenKind(ts.SyntaxKind.SlashEqualsToken)) {
	}
	return expr;
}
class ManagedVariableDeclaration {
	constructor(
		public node: ts.VariableDeclaration,
		public component: ComponentState
	) {}
	public transform(): ts.VariableDeclaration {
		const node = this.node;
		const name: ts.BindingName = node.name;
		const initializer = node.initializer;

		if (ts.isBindingPattern(name)) {
			this.component.transformation_state.transformation_context.addDiagnostic(
				ts.createDiagnosticForNode(name, {
					key: "",
					category: ts.DiagnosticCategory.Error,
					code: 9999,
					message: "Binding patterns aren't supported yet",
				})
			);
			return node;
		}
		if (!initializer) {
			this.component.transformation_state.transformation_context.addDiagnostic(
				ts.createDiagnosticForNode(node, {
					key: "",
					category: ts.DiagnosticCategory.Error,
					code: 9999,
					message: "The initializer must be defined",
				})
			);
			return node;
		}
		const [get, set] = [`__${name.text}`, `__dispatch_${name.text}`];
		this.component.symbols.set(name.text, [get, set]);

		const variable = factory.updateVariableDeclaration(
			node,
			factory.createArrayBindingPattern([
				factory.createBindingElement(undefined, undefined, get),
				factory.createBindingElement(undefined, undefined, set),
			]),
			undefined,
			undefined,
			factory.createCallExpression(
				factory.createIdentifier("__useState"),
				undefined,
				[initializer]
			)
		);
		return variable;
	}
}
