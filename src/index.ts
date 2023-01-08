import { exec } from "child_process";
import { getInstalledPathSync } from "get-installed-path";
import ts, { factory } from "typescript";
import inquirer from "inquirer";
import chalk from "chalk";
import ChildProcess from "child_process";
import { TransformerState } from "./transformer";
interface TransformerConfig {}
/**
 * The transformer entry point.
 * This provides access to necessary resources and the user specified configuration.
 */
export default function (program: ts.Program, config: TransformerConfig) {
	try {
		getInstalledPathSync("@rbxts/roact-hooked", {
			local: true,
		});
	} catch {
		console.log(chalk.bold(chalk.red("@rbxts/roact-hooked is missing")));
		inquirer
			.prompt([
				{
					type: "confirm",
					name: "Confirm",
					message: "Would you like to install @rbxts/roact-hooked?",
					default: true,
				},
			])
			.then((answers) => {
				if (answers.Confirm) {
					const process = ChildProcess.exec("npm install @rbxts/roact-hooked");
				}
			});
	}
	return (
		transformationContext: ts.TransformationContext
	): ((file: ts.SourceFile) => ts.Node) => {
		return (file: ts.SourceFile) => {
			const state = new TransformerState(program, transformationContext);
			const final = add_import(state.transform(file));
			return final;
		};
	};
}
function add_import(source_file: ts.SourceFile): ts.SourceFile {
	return factory.updateSourceFile(source_file, [
		factory.createImportDeclaration(
			undefined,
			undefined,
			factory.createImportClause(
				false,
				undefined,
				factory.createNamedImports([
					factory.createImportSpecifier(
						false,
						factory.createIdentifier("useState"),
						factory.createIdentifier("__useState")
					),
				])
			),
			factory.createStringLiteral("@rbxts/roact-hooked"),
			undefined
		),
		...source_file.statements,
	]);
}
