package com.jvtech.gefinc.category;

import com.jvtech.gefinc.user.UserRegisteredEvent;
import java.util.List;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Cria as categorias iniciais de cada novo usuário, na mesma transação do cadastro (FR-015). */
@Component
class DefaultCategorySeeder {

  record Seed(String name, CategoryType type, String color) {}

  static final List<Seed> DEFAULTS =
      List.of(
          new Seed("Alimentação", CategoryType.EXPENSE, "#F97316"),
          new Seed("Moradia", CategoryType.EXPENSE, "#8B5CF6"),
          new Seed("Transporte", CategoryType.EXPENSE, "#3B82F6"),
          new Seed("Saúde", CategoryType.EXPENSE, "#EF4444"),
          new Seed("Lazer", CategoryType.EXPENSE, "#EC4899"),
          new Seed("Educação", CategoryType.EXPENSE, "#14B8A6"),
          new Seed("Serviços", CategoryType.EXPENSE, "#F59E0B"),
          new Seed("Compras", CategoryType.EXPENSE, "#16A34A"),
          new Seed("Outras despesas", CategoryType.EXPENSE, "#94A3B8"),
          new Seed("Salário", CategoryType.INCOME, "#00E599"),
          new Seed("Outras receitas", CategoryType.INCOME, "#00B4D8"));

  private final CategoryRepository categories;

  DefaultCategorySeeder(CategoryRepository categories) {
    this.categories = categories;
  }

  @EventListener
  void onUserRegistered(UserRegisteredEvent event) {
    categories.saveAll(
        DEFAULTS.stream()
            .map(s -> new Category(event.userId(), s.name(), s.type(), s.color()))
            .toList());
  }
}
