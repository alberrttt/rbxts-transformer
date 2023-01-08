import Roact from "@rbxts/roact";
import { useEffect, withHooks } from "@rbxts/roact-hooked";
import { Players } from "@rbxts/services";
function Component() {
	const msg = "count: ";
	let count = 0;
	useEffect(() => {
		print(count);
	}, [count]);
	return (
		<screengui>
			<textbutton
				Size={new UDim2(0, 400, 0, 400)}
				Text={`${msg} ${count}`}
				Event={{
					MouseButton1Click: () => {
						count += 1;
					},
				}}
			/>
		</screengui>
	);
}
Roact.mount(
	Roact.createElement(withHooks(Component)),
	Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui
);
