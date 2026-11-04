import nx from "@nx/eslint-plugin";

export default [
    ...nx.configs["flat/base"],
    ...nx.configs["flat/typescript"],
    ...nx.configs["flat/javascript"],
    {
        ignores: [
            "**/dist",
            "**/out-tsc",
            "apps/mobile-app/android/**",
            "apps/mobile-app/ios/**",
            "apps/api-server/target/**"
        ]
    },
    {
        files: [
            "**/*.ts",
            "**/*.tsx",
            "**/*.js",
            "**/*.jsx"
        ],
        rules: {
            "@nx/enforce-module-boundaries": [
                "error",
                {
                    enforceBuildableLibDependency: true,
                    // As telas pesadas de ui-shared são carregadas sob demanda pelo entry `@gefinc/ui-shared/pages`,
                    // enquanto o restante da biblioteca é importado de forma estática: sem esta exceção, a regra
                    // proíbe o import estático de uma biblioteca que também aparece em `import()`.
                    checkDynamicDependenciesExceptions: ["@gefinc/ui-shared"],
                    allow: [
                        "^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$"
                    ],
                    // Princípio I da constituição: aplicativos nunca importam outros aplicativos;
                    // todo código compartilhado vive em packages/ (type:lib).
                    depConstraints: [
                        { sourceTag: "type:app", onlyDependOnLibsWithTags: ["type:lib"] },
                        { sourceTag: "type:lib", onlyDependOnLibsWithTags: ["type:lib"] },
                        { sourceTag: "type:e2e", onlyDependOnLibsWithTags: ["type:lib", "type:app"] }
                    ]
                }
            ]
        }
    },
    {
        files: [
            "**/*.ts",
            "**/*.tsx",
            "**/*.cts",
            "**/*.mts",
            "**/*.js",
            "**/*.jsx",
            "**/*.cjs",
            "**/*.mjs"
        ],
        // Override or add rules here
        rules: {}
    }
];
