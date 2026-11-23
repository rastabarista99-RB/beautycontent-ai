import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  webpack(config, { dev, isServer, webpack }) {
    if (dev && !isServer) {
      const runtimeGlobals = webpack.RuntimeGlobals as {
        compatGetDefaultExport: string;
        createFakeNamespaceObject: string;
        definePropertyGetters: string;
        makeNamespaceObject: string;
        hasOwnProperty: string;
        nodeModuleDecorator: string;
        harmonyModuleDecorator: string;
        ensureChunk: string;
      };
      config.plugins.push({
        apply(compiler: {
          hooks: {
            compilation: {
              tap: (
                name: string,
                cb: (compilation: {
                  hooks: {
                    additionalTreeRuntimeRequirements: {
                      tap: (
                        name: string,
                        cb: (chunk: unknown, set: Set<string>) => void,
                      ) => void;
                    };
                  };
                }) => void,
              ) => void;
            };
          };
        }) {
          compiler.hooks.compilation.tap("EnsureWebpackRuntimeHelpers", (compilation) => {
            compilation.hooks.additionalTreeRuntimeRequirements.tap(
              "EnsureWebpackRuntimeHelpers",
              (_chunk, runtimeRequirements) => {
                runtimeRequirements.add(runtimeGlobals.compatGetDefaultExport);
                runtimeRequirements.add(runtimeGlobals.createFakeNamespaceObject);
                runtimeRequirements.add(runtimeGlobals.definePropertyGetters);
                runtimeRequirements.add(runtimeGlobals.makeNamespaceObject);
                runtimeRequirements.add(runtimeGlobals.hasOwnProperty);
                runtimeRequirements.add(runtimeGlobals.nodeModuleDecorator);
                runtimeRequirements.add(runtimeGlobals.harmonyModuleDecorator);
                runtimeRequirements.add(runtimeGlobals.ensureChunk);
              },
            );
          });
        },
      });
    }
    return config;
  },
};

export default nextConfig;
