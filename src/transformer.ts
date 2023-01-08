import ts, { factory } from "typescript";
import {} from "ts-expose-internals";
import { assert } from "console";
import { ComponentState } from "./component";

export class TransformerState {
	public type_checker: ts.TypeChecker;
	public components: Map<ts.Symbol, ComponentState>;
	constructor(
		public program: ts.Program,
		public transformation_context: ts.TransformationContext
	) {
		this.type_checker = program.getTypeChecker();
		this.components = new Map();
	}

	transform<T extends ts.Node>(node: T): T {
		return ts.visitEachChild(
			node,
			(node) => transform_node(this, node),
			this.transformation_context
		);
	}
}

function transform_node(state: TransformerState, node: ts.Node): ts.Node {
	if (ts.isFunctionDeclaration(node)) return transform_fn_dec(state, node);
	return node;
}
function transform_fn_dec(
	state: TransformerState,
	node: ts.FunctionDeclaration
): ts.FunctionDeclaration {
	state.type_checker.getSymbolAtLocation(node);
	if (is_jsx_fn(state, node) && node.body) {
		const component = new ComponentState(state, node);
		state.components.set(node.symbol, component);

		return component.transform();
	}
	return node;
}
/**
 * @description
 * checks if the function declaration is
 *
 */
function is_jsx_fn(
	state: TransformerState,
	fn_dec: ts.FunctionDeclaration
): boolean {
	const fn_sig = state.type_checker.getSignatureFromDeclaration(fn_dec);
	if (!fn_sig) {
		return false;
	}
	const resolved_return = fn_sig.getReturnType();
	if (!resolved_return) {
		return false;
	}
	const type_symbol = resolved_return.symbol;
	if (!type_symbol) return false;
	const parent = type_symbol.parent;
	if (!parent) return false;
	return parent.escapedName == "Roact" && type_symbol.name == "Element";
}
